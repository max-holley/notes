import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import { useUi } from '../store/ui.ts';

/** One Snackbar at a time (M3 guidance); queued toasts show in order. */
export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  const t = toasts[0];
  return (
    <Snackbar
      key={t?.id}
      open={!!t}
      autoHideDuration={t?.duration ?? (t?.action ? 8000 : 4000)}
      onClose={(_, reason) => reason !== 'clickaway' && t && dismiss(t.id)}
      message={t?.message}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      sx={{ bottom: { xs: 96, sm: 24 } }}
      action={
        <>
          {t?.action && (
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
              sx={{ color: 'm3.inversePrimary' }}
            >
              {t.action.label}
            </Button>
          )}
          <IconButton size="small" aria-label="Dismiss" color="inherit" onClick={() => t && dismiss(t.id)}>
            <CloseOutlined fontSize="small" />
          </IconButton>
        </>
      }
    />
  );
}
