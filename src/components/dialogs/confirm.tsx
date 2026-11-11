import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import type { ReactNode } from 'react';
import { create } from 'zustand';

export interface ConfirmChoice {
  value: string;
  label: string;
  color?: 'primary' | 'error';
  variant?: 'text' | 'contained' | 'outlined';
}
interface Req {
  title: string;
  body: ReactNode;
  choices: ConfirmChoice[];
  stacked?: boolean;
  resolve(v: string | null): void;
}
const useConfirm = create<{ req: Req | null }>(() => ({ req: null }));

/** Ask the user to pick one of `choices` (null = cancelled / Escape / backdrop). */
export function choose(title: string, body: ReactNode, choices: ConfirmChoice[], stacked = false): Promise<string | null> {
  return new Promise((resolve) => useConfirm.setState({ req: { title, body, choices, stacked, resolve } }));
}

/** Simple confirm with a single (by default destructive) action. */
export async function confirm(title: string, body: ReactNode, action = 'Delete', color: 'primary' | 'error' = 'error'): Promise<boolean> {
  return (await choose(title, body, [{ value: 'ok', label: action, color, variant: 'contained' }])) === 'ok';
}

export function ConfirmHost() {
  const req = useConfirm((s) => s.req);
  const done = (v: string | null) => {
    req?.resolve(v);
    useConfirm.setState({ req: null });
  };
  return (
    <Dialog open={!!req} onClose={() => done(null)} maxWidth="xs" fullWidth aria-labelledby="confirm-title">
      <DialogTitle id="confirm-title">{req?.title}</DialogTitle>
      <DialogContent>
        <DialogContentText component="div">{req?.body}</DialogContentText>
      </DialogContent>
      {req?.stacked ? (
        <Stack spacing={1} sx={{ p: 3, pt: 0 }}>
          {req.choices.map((c) => (
            <Button key={c.value} variant={c.variant ?? 'outlined'} color={c.color ?? 'primary'} onClick={() => done(c.value)}>
              {c.label}
            </Button>
          ))}
          <Button onClick={() => done(null)}>Cancel</Button>
        </Stack>
      ) : (
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => done(null)}>Cancel</Button>
          {req?.choices.map((c) => (
            <Button key={c.value} variant={c.variant ?? 'text'} color={c.color ?? 'primary'} onClick={() => done(c.value)}>
              {c.label}
            </Button>
          ))}
        </DialogActions>
      )}
    </Dialog>
  );
}
