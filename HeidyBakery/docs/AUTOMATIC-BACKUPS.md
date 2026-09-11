# Automatic full backups

After a save introduces a newly reviewed receipt, the native app writes a validated
full backup of the saved library and receipt originals. Draft-only saves do not
create copies. A failed backup is retried on the next save or through Back up now.
Failure never rolls back an already committed library save.

Settings shows the destination, last success and a persistent failure warning.
Healthy backups add no success toast. Folder selection is stored as a security
bookmark in per-library `automatic-backups.json`. A manual backup also configures
its parent folder for future automatic copies; a folder-configuration failure is
reported separately from a successful manual backup.

The default is `Automatic Backups` inside the existing application data directory.
The user can choose an iCloud or other folder. This writes local files; iCloud
controls subsequent cloud synchronization. Automatic backup does not relocate the
SQLite database or replace the manual backup command.

Each library installation has a UUID prefix. After a successful atomic write,
retention removes only older automatic files with that prefix, keeping ten copies.
Manual files and another installation's automatic copies are not removed. Paths
are standardized before excluding the just-written copy from the retention list.

Native self-tests cover approval-only triggering, valid full archives, retention,
manual/other-installation preservation, bookmark reload, missing originals,
unavailable folders, error persistence, unchanged library state and recovery.
The browser test covers save success despite backup failure, persistent warnings,
navigation/reload, picker cancellation, retry and manual-backup response handling.
The native unit-conversion workflow also checks that receipt approval creates a
successful automatic backup through the real app bridge.
