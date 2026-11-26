import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
const mocks = vi.hoisted(() => ({ load: vi.fn(), token: 'token', auth: { session: { farmerId: 'farmer', tenantId: 'tenant', createdAt: 'today' }, user: null, isLoading: false } }));
vi.mock('@/services/soil/soilReport', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/services/soil/soilReport')>()), loadSoilState: mocks.load }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ getSessionToken: () => mocks.token }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));
vi.mock('@/hooks/useTextToSpeech', () => ({ useTextToSpeech: () => ({ speak: vi.fn(), stop: vi.fn(), isSpeaking: false }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/skeletons', () => ({ SoilHealthSkeleton: () => <div>Loading report</div> }));
vi.mock('html2canvas', () => ({ default: vi.fn() }));
vi.mock('jspdf', () => ({ default: vi.fn() }));
import SoilHealthReport from '../SoilHealthReport';
function show() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={['/app/lands/land/soil']}><Routes>
      <Route path="/app/lands/:id/soil" element={<SoilHealthReport />} />
      <Route path="/app/lands/:id" element={<div>Land details</div>} />
    </Routes></MemoryRouter>
  </QueryClientProvider>);
}
beforeEach(() => { cleanup(); vi.clearAllMocks(); mocks.token = 'token'; mocks.auth.isLoading = false; });
it('keeps an empty report on screen and allows returning to the selected land', async () => {
  mocks.load.mockResolvedValue({land:{id:'land',name:'Test land'},legacy:null,model:null,job:null,engine_available:true}); show();
  expect(await screen.findByText('soil.getSoil')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('soil.backToLand'));
  expect(screen.getByText('Land details')).toBeInTheDocument();
});
it('offers retry after a failed read and recovers', async () => {
  mocks.load.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({land:{id:'land',name:'Test land'},legacy:null,model:null,job:null,engine_available:true}); show();
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  fireEvent.click(screen.getByText('soil.checkAgain'));
  expect(await screen.findByText('soil.getSoil')).toBeInTheDocument();
  expect(mocks.load).toHaveBeenCalledTimes(2);
});
it('waits while authentication is loading', async () => {
  mocks.auth.isLoading = true; show();
  expect(screen.getByText('Loading report')).toBeInTheDocument();
  expect(mocks.load).not.toHaveBeenCalled();
});
it('does not read when the server session is missing', () => {
  mocks.token = ''; show();
  expect(screen.getByText('soil.signInRequired')).toBeInTheDocument();
  expect(mocks.load).not.toHaveBeenCalled();
});
it('renders numeric strings and zero values without a crash, and labels map estimates', async () => {
  mocks.load.mockResolvedValue({land:{id:'land',name:'Test land'},model:null,job:null,engine_available:true,legacy:{ id:'r', ph_level:'6.8',organic_carbon:'0',nitrogen_kg_per_ha:0,source:'soilgrid'}});
  show();
  expect(await screen.findByText('6.8')).toBeInTheDocument();
  // A zero carbon value is shown as 0, never hidden as missing.
  expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '0%')).toBeInTheDocument();
  expect(screen.getByText('soil.modelledNotice')).toBeInTheDocument();
  await waitFor(() => expect(mocks.load).toHaveBeenCalledWith('land', 'farmer', 'tenant'));
});

it('starts the soil fetch from the empty page and displays real job progress', async()=>{
  const initial={land:{id:'land',name:'Test land'},legacy:null,model:null,job:null,engine_available:true};
  mocks.load.mockResolvedValueOnce(initial).mockResolvedValueOnce({status:'queued'}).mockResolvedValue({...initial,job:{id:'job',status:'running',progress:37}});
  show();fireEvent.click(await screen.findByText('soil.getSoil'));
  await waitFor(()=>expect(mocks.load).toHaveBeenCalledWith('land','farmer','tenant',true));
  expect(await screen.findByText('37%')).toBeInTheDocument();
});
it('does not send a fetch when the server explicitly reports missing source configuration', async()=>{
  mocks.load.mockImplementation((_id:string,_farmer:string,_tenant:string,start?:boolean)=>
    start ? Promise.reject(new Error('ENGINE_NOT_CONFIGURED')) :
    Promise.resolve({land:{id:'land',name:'Test land'},legacy:null,model:null,job:null,engine_available:false,engine_status:'SOURCE_NOT_CONFIGURED'}));
  show();
  const btn=await screen.findByText('soil.getSoil');
  expect(btn).toBeDisabled();
  expect(screen.getByText('soil.sourceNotConfigured')).toBeInTheDocument();
  fireEvent.click(btn);
  expect(mocks.load).toHaveBeenCalledTimes(1);
  expect(mocks.load).not.toHaveBeenCalledWith('land','farmer','tenant',true);
  fireEvent.click(screen.getByText('soil.backToLand'));
  expect(screen.getByText('Land details')).toBeInTheDocument();
});
it('does not enqueue when the server reports an unavailable queue', async()=>{
  mocks.load.mockResolvedValue({land:{id:'land',name:'Test land'},legacy:null,model:null,job:null,engine_available:false,engine_status:'QUEUE_UNAVAILABLE'});
  show();
  const button=await screen.findByText('soil.getSoil');
  fireEvent.click(button);
  expect(mocks.load).toHaveBeenCalledTimes(1);
  expect(mocks.load).not.toHaveBeenCalledWith('land','farmer','tenant',true);
});
it('still permits an explicit retry when readiness is unknown rather than configuration-blocked', async()=>{
  mocks.load.mockImplementation((_id:string,_farmer:string,_tenant:string,start?:boolean)=>
    start ? Promise.reject(new Error('ENGINE_OFFLINE')) :
    Promise.resolve({land:{id:'land',name:'Test land'},legacy:null,model:null,job:null,engine_available:false}));
  show();
  fireEvent.click(await screen.findByText('soil.getSoil'));
  await waitFor(()=>expect(mocks.load).toHaveBeenCalledWith('land','farmer','tenant',true));
});
it('explains scheduled processing when GitHub immediate dispatch is not configured',async()=>{
  mocks.load.mockResolvedValue({land:{id:'land',name:'Test land'},legacy:null,model:null,job:null,engine_available:true,dispatch_mode:'scheduled'});
  show();
  expect(await screen.findByText('soil.getSoil')).toBeEnabled();
  expect(screen.getByText('soil.scheduledDispatch')).toBeInTheDocument();
});
it('opens on the lab report when one exists and shows its N, P, K; the satellite tab keeps the soil-map fetch', async()=>{
  mocks.load.mockResolvedValue({land:{id:'land',name:'Test land'},model:null,job:null,engine_available:true,
    legacy:{id:'lab',source:'lab_test',ph_level:7.4,nitrogen_kg_per_ha:180,nitrogen_level:'low'},
    sources:{lab:{id:'lab',source:'lab_test',ph_level:7.4,nitrogen_kg_per_ha:180,nitrogen_level:'low'},satellite:{id:'map',source:'soilgrid',ph_level:6.7},device:null}});
  show();
  expect(await screen.findByText('7.4')).toBeInTheDocument();
  expect(screen.getByText('180')).toBeInTheDocument();
  expect(screen.queryByText('soil.getSoil')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab',{name:/soil.sourceTypes.satellite/}));
  expect(await screen.findByText('soil.getSoil')).toBeInTheDocument();
  expect(screen.getByText('6.7')).toBeInTheDocument();
  expect(screen.getByText('soil.npkSatelliteHelp')).toBeInTheDocument();
});
it('shows the device tab as coming soon and the lab tab as not added when only a satellite estimate exists', async()=>{
  mocks.load.mockResolvedValue({land:{id:'land',name:'Test land'},model:null,job:null,engine_available:true,legacy:null,
    sources:{lab:null,satellite:null,device:null}});
  show();
  expect(await screen.findByText('soil.getSoil')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab',{name:/soil.sourceTypes.device/}));
  expect(await screen.findByText('soil.deviceSoonTitle')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab',{name:/soil.sourceTypes.lab/}));
  expect(await screen.findByText('soil.noLabTitle')).toBeInTheDocument();
});
