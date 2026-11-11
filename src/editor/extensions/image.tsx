import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Image from '@tiptap/extension-image';
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { imageUrl } from '../../services/drive/client.ts';

/** Images stored as separate Drive files are lazy-loaded through authenticated blob URLs. */
function ImageView({ node, selected }: ReactNodeViewProps) {
  const driveId = node.attrs.driveId as string | null;
  const [src, setSrc] = useState<string | null>(driveId ? null : (node.attrs.src as string | null));
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!driveId || !ref.current) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      imageUrl(driveId).then(setSrc, () => setFailed(true));
    }, { rootMargin: '200px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [driveId]);
  return (
    <NodeViewWrapper as="div" data-drag-handle="" ref={ref}>
      {src ? (
        <Box
          component="img"
          src={src}
          alt={(node.attrs.alt as string) ?? ''}
          data-drive-id={driveId ?? undefined}
          sx={{ maxWidth: '100%', height: 'auto', borderRadius: 2, display: 'block', my: 1, outline: selected ? 2 : 0, outlineStyle: 'solid', outlineColor: 'primary.main' }}
        />
      ) : (
        <Skeleton variant="rectangular" height={160} sx={{ my: 1 }} aria-label={failed ? 'Image unavailable' : 'Loading image'} />
      )}
    </NodeViewWrapper>
  );
}

export const NotesImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      driveId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-drive-id'),
        renderHTML: (a) => (a.driveId ? { 'data-drive-id': a.driveId as string } : {}),
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    // Drive images are stored without a src: they are fetched with the user's token at view time.
    const attrs = { ...HTMLAttributes };
    if (attrs['data-drive-id']) delete attrs.src;
    return ['img', attrs];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
}).configure({ allowBase64: true, inline: false });
