// Compatibility wrapper: the schedule timeline is rendered by the farmer-safe presentation layer.
// Keep this path stable because CropScheduleView imports TaskTimeline directly.
export { default } from './FarmerTaskTimeline';
