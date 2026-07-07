import re

# Fix fs_ops.rs specifically for rclone call
with open('src/fs_ops.rs', 'r') as f:
    fs_content = f.read()
fs_content = re.sub(r'    if let Some\(listing\) = crate::rclone::rclone_directory_listing_for_mount_path\(&raw_path\)\.await\?\n\s+\{\n\s+return Ok\(listing\);\n\s+\}\n', '', fs_content)
with open('src/fs_ops.rs', 'w') as f:
    f.write(fs_content)

# Fix progress.rs specifically for rclone call
with open('src/progress.rs', 'r') as f:
    prog_content = f.read()

# Replace the transfer_mounted_path_blocking call with `let handled = false;`
prog_content = re.sub(r'    let handled = crate::rclone::transfer_mounted_path_blocking\(\n\s+action,\n\s+&plan\.source_path,\n\s+&plan\.final_dest,\n\s+source_meta\.is_dir\(\),\n\s+plan\.replace_existing,\n\s+\)\?;', '    let handled = false;', prog_content)
with open('src/progress.rs', 'w') as f:
    f.write(prog_content)
