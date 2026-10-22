/** Drag-and-drop payload for a task (dragged from a list row onto an area or Today). */
export const TASK_DRAG_TYPE = 'application/x-cairn-task'

export const isTaskDrag = (e: { dataTransfer: DataTransfer | null }): boolean =>
  Boolean(e.dataTransfer?.types.includes(TASK_DRAG_TYPE))
