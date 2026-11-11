import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import ArrowDownwardOutlined from '@mui/icons-material/ArrowDownwardOutlined';
import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import DragIndicatorOutlined from '@mui/icons-material/DragIndicatorOutlined';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import { CONTROLS } from '../../editor/controls.tsx';
import { layoutReducer, normalizeLayout, type LayoutAction, type LayoutItem, type ToolbarLayout } from '../../editor/toolbarLayout.ts';
import { useNotes } from '../../store/notes.ts';
import { useUi } from '../../store/ui.ts';

function Row({ it, index, count, dispatch }: { it: LayoutItem; index: number; count: number; dispatch(a: LayoutAction): void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: it.id });
  const c = it.type === 'control' ? CONTROLS[it.id] : null;
  return (
    <ListItem
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      disableGutters
      data-testid={`customise-${it.id}`}
      sx={{ bgcolor: isDragging ? 'm3.surfaceContainerHighest' : undefined, borderRadius: 2, pr: 1 }}
    >
      <IconButton size="small" aria-label={`Reorder ${c?.label ?? 'separator'}`} {...attributes} {...listeners} sx={{ cursor: 'grab', mr: 1 }}>
        <DragIndicatorOutlined fontSize="small" />
      </IconButton>
      {it.type === 'control' && c ? (
        <>
          <ListItemIcon sx={{ minWidth: 36 }}><c.icon fontSize="small" /></ListItemIcon>
          <ListItemText primary={c.label} secondary={c.shortcut} />
          <Checkbox checked={it.visible} onChange={() => dispatch({ type: 'toggle', id: it.id })} slotProps={{ input: { 'aria-label': `Show ${c.label}` } }} />
        </>
      ) : (
        <>
          <Divider sx={{ flex: 1, mr: 1 }} aria-hidden />
          <ListItemText primary="Separator" sx={{ flex: '0 0 auto', mr: 1 }} slotProps={{ primary: { variant: 'caption', color: 'text.secondary' } }} />
          <Tooltip title="Remove separator"><IconButton size="small" aria-label="Remove separator" onClick={() => dispatch({ type: 'remove', id: it.id })}><DeleteOutlined fontSize="small" /></IconButton></Tooltip>
        </>
      )}
      <Tooltip title="Move up"><span><IconButton size="small" aria-label={`Move ${c?.label ?? 'separator'} up`} disabled={index === 0} onClick={() => dispatch({ type: 'move', from: index, to: index - 1 })}><ArrowUpwardOutlined fontSize="small" /></IconButton></span></Tooltip>
      <Tooltip title="Move down"><span><IconButton size="small" aria-label={`Move ${c?.label ?? 'separator'} down`} disabled={index === count - 1} onClick={() => dispatch({ type: 'move', from: index, to: index + 1 })}><ArrowDownwardOutlined fontSize="small" /></IconButton></span></Tooltip>
    </ListItem>
  );
}

export function ToolbarCustomizeDialog() {
  const open = useUi((s) => s.dialog === 'toolbar');
  const set = useUi((s) => s.set);
  const stored = useNotes((s) => s.doc.prefs.toolbar);
  const setPrefs = useNotes((s) => s.setPrefs);
  const layout = normalizeLayout(stored);
  const [draft, setDraft] = useState<ToolbarLayout | null>(null);
  const cur = draft ?? layout;
  const dispatch = (a: LayoutAction) => setDraft(layoutReducer(cur, a));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = cur.items.findIndex((i) => i.id === e.active.id);
    const to = cur.items.findIndex((i) => i.id === e.over!.id);
    dispatch({ type: 'move', from, to });
  };
  const close = () => {
    setDraft(null);
    set({ dialog: null });
  };
  const save = () => {
    if (draft) setPrefs({ toolbar: draft });
    close();
  };
  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-labelledby="tbc-title">
      <DialogTitle id="tbc-title">Customise toolbar</DialogTitle>
      <DialogContent dividers>
        <DialogContentText sx={{ mb: 1 }}>
          Show or hide controls and drag (or use the arrows / Space + arrow keys) to reorder. Hidden controls stay reachable here: right-click the toolbar or use its tune button.
        </DialogContentText>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={cur.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <List dense>
              {cur.items.map((it, i) => <Row key={it.id} it={it} index={i} count={cur.items.length} dispatch={dispatch} />)}
            </List>
          </SortableContext>
        </DndContext>
        <Box><Button onClick={() => dispatch({ type: 'addSeparator', index: cur.items.length })}>Add separator</Button></Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setDraft(layoutReducer(cur, { type: 'reset' }))} data-testid="toolbar-reset">Reset to default</Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={close}>Cancel</Button>
        <Button variant="contained" onClick={save} data-testid="toolbar-save">Save</Button>
      </DialogActions>
    </Dialog>
  );
}
