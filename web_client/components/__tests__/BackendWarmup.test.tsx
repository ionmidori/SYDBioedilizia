import { render } from "@testing-library/react";
import { BackendWarmup } from "../BackendWarmup";
import { resetBackendWarmupForTests, warmBackend } from "@/lib/backend-warmup";

beforeEach(() => {
    jest.restoreAllMocks();
    resetBackendWarmupForTests();
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
});

describe("BackendWarmup", () => {
    it("should fire a /health request on mount", () => {
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

    it("should render nothing", () => {
        const { container } = render(<BackendWarmup />);
        expect(container.innerHTML).toBe("");
    });

    it("should not throw on fetch failure", () => {
        (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("network"));

        expect(() => render(<BackendWarmup />)).not.toThrow();
    });
});

describe("warmBackend", () => {
    it("sends at most one request per interval", () => {
        warmBackend();
        warmBackend();
        render(<BackendWarmup />);

        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("warms again once the interval has passed", () => {
        const now = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
        warmBackend();
        now.mockReturnValue(1_000_000 + 5 * 60 * 1000);
        warmBackend();

        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("is not aborted when the component unmounts", () => {
        const { unmount } = render(<BackendWarmup />);
        unmount();

        const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
        expect(init.signal?.aborted).toBe(false);
    });
});
