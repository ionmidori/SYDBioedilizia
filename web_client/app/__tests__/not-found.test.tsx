import { render, screen } from "@testing-library/react";
import NotFound from "@/app/not-found";

jest.mock("@/components/sections/Navbar", () => ({ Navbar: () => null }));
jest.mock("@/components/sections/Footer", () => ({ Footer: () => null }));

describe("NotFound page", () => {
  it("renders an h1 heading and navigation links to key public routes", () => {
    render(<NotFound />);

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();

    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));

    expect(hrefs).toEqual(expect.arrayContaining(["/", "/progetti", "/blog", "/faq"]));
  });
});

