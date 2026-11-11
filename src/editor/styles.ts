import type { SxProps, Theme } from '@mui/material/styles';
import { MONO_STACK } from '../theme/tokens.ts';

/** Typography and block styles for note content, all from theme tokens. */
export const editorContentSx: SxProps<Theme> = (t) => ({
  maxWidth: 820,
  mx: 'auto',
  '& .ProseMirror': {
    outline: 'none',
    minHeight: '50vh',
    ...t.typography.body1,
    color: t.vars!.palette.text.primary,
    '& > * + *': { mt: 1 },
    '& p': { my: 0.5 },
    '& h1': { ...t.typography.h4, mt: 3, mb: 1 },
    '& h2': { ...t.typography.h5, mt: 2.5, mb: 1 },
    '& h3': { ...t.typography.h6, mt: 2, mb: 0.5 },
    '& a': { color: t.vars!.palette.primary.main, textDecoration: 'underline', cursor: 'pointer' },
    '& blockquote': { borderLeft: 4, borderColor: t.vars!.palette.m3.outlineVariant, pl: 2, ml: 0, color: t.vars!.palette.text.secondary },
    '& code': { fontFamily: MONO_STACK, fontSize: '0.875em', bgcolor: t.vars!.palette.m3.surfaceContainerHighest, px: 0.5, borderRadius: 1 },
    '& pre': { fontFamily: MONO_STACK, bgcolor: t.vars!.palette.m3.surfaceContainerHighest, p: 2, borderRadius: 2, overflowX: 'auto', '& code': { bgcolor: 'transparent', p: 0 } },
    '& hr': { border: 0, borderTop: 1, borderColor: t.vars!.palette.divider, my: 2 },
    '& ul, & ol': { pl: 3 },
    '& ul[data-type="taskList"]': { listStyle: 'none', pl: 0.5, '& ul[data-type="taskList"]': { pl: 3 } },
    '& mark': { borderRadius: 0.5, px: 0.25, color: 'inherit' },
    '& table': { borderCollapse: 'collapse', width: '100%', my: 2, tableLayout: 'fixed' },
    '& td, & th': { border: 1, borderColor: t.vars!.palette.m3.outlineVariant, p: 1, verticalAlign: 'top', position: 'relative', '& p': { m: 0 } },
    '& th': { bgcolor: t.vars!.palette.m3.surfaceContainerHigh, fontWeight: 500, textAlign: 'left' },
    '& .selectedCell': { bgcolor: t.vars!.palette.m3.secondaryContainer },
    '& p.is-editor-empty:first-of-type::before': { content: 'attr(data-placeholder)', color: t.vars!.palette.text.disabled, float: 'left', height: 0, pointerEvents: 'none' },
    '& img': { maxWidth: '100%' },
  },
});
