import { FlaskConical, Satellite, Cpu } from 'lucide-react';
import type { SoilSourceKey } from '@/services/soil/soilReport';

/** One icon per soil report type, and the order they are shown in everywhere. */
export const SOIL_SOURCE_ICON: Record<SoilSourceKey, typeof Satellite> = { lab: FlaskConical, satellite: Satellite, device: Cpu };
export const SOIL_SOURCE_ORDER: SoilSourceKey[] = ['lab', 'satellite', 'device'];
