import CropDateInput from '@/components/schedule/CropDateInput';

export default function VarietyProbe() {
  return (
    <CropDateInput
      land={{ id: '00000000-0000-0000-0000-000000000000', name: 'Probe', area_acres: 2 }}
      onSubmit={() => {}}
      onBack={() => {}}
    />
  );
}
