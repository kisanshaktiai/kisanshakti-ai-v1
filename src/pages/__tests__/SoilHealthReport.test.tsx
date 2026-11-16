import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
const mocks = vi.hoisted(() => ({ load: vi.fn(), token: 'token', auth: { session: { farmerId: 'farmer', tenantId: 'tenant', createdAt: 'today' }, user: null, isLoading: false } }));
vi.mock('@/services/soil/soilReport', () => ({ loadSoilState: mocks.load, soilNumber: (v: unknown) => v == null || !Number.isFinite(Number(v)) ? null : Number(v) }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ getSessionToken: () => mocks.token }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
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
  expect(screen.getByText('0.00%')).toBeInTheDocument();
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
it('lets a farmer attempt an explicit fetch when readiness check fails, with a clear backend error', async()=>{
  mocks.load.mockImplementation((_id:string,_farmer:string,_tenant:string,start?:boolean)=>
    start ? Promise.reject(new Error('ENGINE_NOT_CONFIGURED')) :
    Promise.resolve({land:{id:'land',name:'Test land'},legacy:null,model:null,job:null,engine_available:false,engine_status:'SOURCE_NOT_CONFIGURED'}));
  show();
  const btn=await screen.findByText('soil.getSoil');
  expect(btn).toBeEnabled();
  expect(screen.getByText('soil.sourceNotConfigured')).toBeInTheDocument();
  fireEvent.click(btn);
  await waitFor(()=>expect(mocks.load).toHaveBeenCalledWith('land','farmer','tenant',true));
  expect(await screen.findByRole('alert')).toHaveTextContent('soil.sourceNotConfigured');
});
it('explains scheduled processing when GitHub immediate dispatch is not configured',async()=>{
  mocks.load.mockResolvedValue({land:{id:'land',name:'Test land'},legacy:null,model:null,job:null,engine_available:true,dispatch_mode:'scheduled'});
  show();
  expect(await screen.findByText('soil.getSoil')).toBeEnabled();
  expect(screen.getByText('soil.scheduledDispatch')).toBeInTheDocument();
});
