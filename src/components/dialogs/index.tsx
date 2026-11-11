import { DeleteAccountDialog, DevicesDialog } from './AccountDialogs.tsx';
import { CategoriesManager, CategoryDialog, StatsDialog, TagManagerDialog } from './OrganizeDialogs.tsx';
import { FontDialog, ImportExportDialog, SettingsDialog } from './SettingsDialogs.tsx';
import { ToolbarCustomizeDialog } from './ToolbarCustomizeDialog.tsx';
import { services } from '../../services/index.ts';

/** Every app-level dialog, mounted once in the workspace. */
export function AccountDialogs() {
  return (
    <>
      <SettingsDialog />
      <FontDialog />
      <ToolbarCustomizeDialog />
      <ImportExportDialog />
      <DevicesDialog />
      <DeleteAccountDialog />
      <CategoryDialog />
      <CategoriesManager />
      <TagManagerDialog />
      <StatsDialog />
      {services.map((s) => s.dialogs && <s.dialogs key={s.id} />)}
    </>
  );
}
