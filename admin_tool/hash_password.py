"""Generate a bcrypt hash for an admin_tool account.

Run interactively, then paste the printed hash into the `password:` field of
`admin_tool/config.yaml` (untracked — it holds credentials).

The password is read via getpass, never taken from argv: a command-line argument
would land in the shell history and be visible in the process list.
"""
import getpass

import bcrypt


def main() -> None:
    password = getpass.getpass("Password to hash: ")
    if not password:
        raise SystemExit("Empty password — aborted.")
    if password != getpass.getpass("Confirm: "):
        raise SystemExit("Passwords do not match — aborted.")

    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
    print(hashed.decode())


if __name__ == "__main__":
    main()
