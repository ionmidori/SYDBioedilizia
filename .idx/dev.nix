# To learn more about how to use Nix to configure your environment
# see: https://developers.google.com/idx/guides/customize-idx-env
{ pkgs, ... }: {
  # Which nixpkgs channel to use.
  channel = "stable-24.05"; # or "unstable"
  # Use https://search.nixos.org/packages to find packages
  packages = [
    pkgs.nodejs_20
    pkgs.python312
    pkgs.uv
    pkgs.postgresql
    pkgs.google-cloud-sdk
  ];
  # Sets environment variables in the workspace
  env = {};
  idx = {
    # Search for the extensions you want on https://open-vsx.org/ and use "publisher.id"
    extensions = [
      "rangav.vscode-thunder-client"
      "ms-python.python"
      "charliermarsh.ruff"
      "tamasfe.even-better-toml"
      "bradlc.vscode-tailwindcss"
      "google.gemini-code-assist"
    ];
    # Enable previews
    previews = {
      enable = true;
      previews = {
        web = {
          # Example: run "npm run dev" with PORT set to IDX's defined port for previews,
          # and show it in IDX's web preview panel
          command = ["npm" "run" "dev:web" "--" "--port" "$PORT" "--hostname" "0.0.0.0"];
          manager = "web";
        };
      };
    };
    # Workspace lifecycle hooks
    workspace = {
      # Runs when a workspace is first created
      onCreate = {
        # Check for .env and create if missing
        init-env = "cp -n .env.example .env || true";
        # Frontend install
        npm-install = "npm install";
        # Backend install
        py-install = "cd backend_python && uv venv && uv pip install -e .";
      };
      # Runs when the workspace is (re)started
      onStart = {
        # Start backend in background (simplified for IDX)
        # Note: Ideally we run both dev:web and dev:py. 
        # IDX currently supports one primary preview. We might need a compound script.
      };
    };
  };
}
