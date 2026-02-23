import { render } from "@testing-library/react";
import { BackendWarmup } from "../BackendWarmup";

const mockSessionStorage: Record<string, string> = {};

beforeEach(() => {
    jest.restoreAllMocks();
    Object.keys(mockSessionStorage).forEach((k) => delete mockSessionStorage[k]);

    Object.defineProperty(window, "sessionStorage", {
        value: {
            getItem: (key: string) => mockSessionStorage[key] ?? null,
            setItem: (key: string, val: string) => {
                mockSessionStorage[key] = val;
            },
            removeItem: (key: string) => {
                delete mockSessionStorage[key];
            },
        },
        writable: true,
    });

    global.fetch = jest.fn().mockResolvedValue({ ok: true });
});

describe("BackendWarmup", () => {
    it("should fire a single /health request on first mount", () => {
        render(<BackendWarmup />);

        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining("/health"),
            expect.objectContaining({
                method: "GET",
                credentials: "omit",
            })
        );
    });

    it("should not fire again when already warmed in session", () => {
        mockSessionStorage["syd_backend_warmed"] = "1";

        render(<BackendWarmup />);

        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should render nothing", () => {
        const { container } = render(<BackendWarmup />);
        expect(container.innerHTML).toBe("");
    });

    it("should not throw on fetch failure", () => {
        (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("network"));

        expect(() => render(<BackendWarmup />)).not.toThrow();
    });
});
