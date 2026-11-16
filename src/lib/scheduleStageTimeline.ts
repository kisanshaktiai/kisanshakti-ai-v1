/** Presentation only: stages and timing are copied from the saved database plan. */
export interface TimelineTask {
  id: string;
  task_date: string;
  status: string;
  stage_uuid?: string | null;
  stage_key?: string | null;
  stage_name?: string | null;
  stage_order?: number | null;
  /** The generator's order of work within a day (agronomic sequence). */
  sequence_order?: number | null;
}

export interface SavedStage {
  order?: number | null;
  stage_key?: string | null;
  stage_name?: string | null;
  das_from?: number | null;
  das_to?: number | null;
}

export interface TimelineStage<T extends TimelineTask> {
  id: string;
  label: string | null;
  order: number;
  dasFrom: number | null;
  dasTo: number | null;
  tasks: T[];
  current: boolean;
  unassigned: boolean;
}

const seqOf = (t: TimelineTask): number => (t.sequence_order != null && Number.isFinite(Number(t.sequence_order)) ? Number(t.sequence_order) : Number.MAX_SAFE_INTEGER);

export function buildStageTimeline<T extends TimelineTask>(tasks: T[], saved: SavedStage[], currentUuid?: string | null): TimelineStage<T>[] {
  const groups = new Map<string, TimelineStage<T>>();
  const keyToId = new Map<string, string>();
  // UUIDs take priority: two distinct picking phases must never merge by label.
  for (const task of tasks) {
    if (task.stage_uuid && task.stage_key) keyToId.set(task.stage_key, task.stage_uuid);
  }
  saved.forEach((stage, index) => {
    if (!stage.stage_key) return;
    const id = keyToId.get(stage.stage_key) ?? `key:${stage.stage_key}`;
    groups.set(id, { id, label: stage.stage_name ?? null, order: stage.order ?? index,
      dasFrom: stage.das_from ?? null, dasTo: stage.das_to ?? null, tasks: [], current: id === currentUuid, unassigned: false });
  });
  tasks.forEach((task, index) => {
    const id = task.stage_uuid ?? (task.stage_key ? keyToId.get(task.stage_key) ?? `key:${task.stage_key}` : 'unassigned');
    let group = groups.get(id);
    if (!group) {
      group = { id, label: task.stage_name ?? null, order: task.stage_order ?? saved.length + index,
        dasFrom: null, dasTo: null, tasks: [], current: id === currentUuid, unassigned: id === 'unassigned' };
      groups.set(id, group);
    }
    group.tasks.push(task);
    if (!group.label && task.stage_name) group.label = task.stage_name;
  });
  return [...groups.values()].sort((a, b) => Number(a.unassigned) - Number(b.unassigned) || a.order - b.order).map((stage) => ({
    ...stage, tasks: [...stage.tasks].sort((a, b) => a.task_date.localeCompare(b.task_date) || seqOf(a) - seqOf(b)),
  }));
}

export function initialTimelineStage<T extends TimelineTask>(stages: TimelineStage<T>[]): string | null {
  return (stages.find((s) => s.current) ?? stages.find((s) => s.tasks.some((task) => task.status === 'pending')) ?? stages[0])?.id ?? null;
}