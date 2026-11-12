import { render, screen } from "@testing-library/react";
import { FAQAnswer } from "@/components/faq/FAQAnswer";

describe("FAQAnswer", () => {
  it("renders bold segments as <strong> without injecting HTML", () => {
    render(<FAQAnswer blocks={[{ type: "lead", text: "Prezzo **800€** al mq." }]} />);
    expect(screen.getByText("800€").tagName).toBe("STRONG");
  });

  it("renders any HTML in the data as literal text, never as markup", () => {
    render(<FAQAnswer blocks={[{ type: "p", text: "<img src=x onerror=alert(1)>" }]} />);
    // The string is shown verbatim; no <img> element is created.
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});
