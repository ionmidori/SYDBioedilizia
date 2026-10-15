import { render } from "@testing-library/react";
import { RichInline } from "../RichInline";
import { serializeJsonLd } from "@/lib/blog/seo";

describe("RichInline", () => {
  it("turns **markers** into <strong> and keeps the rest as text", () => {
    const { container } = render(
      <p>
        <RichInline text="Il **50%** delle spese" />
      </p>,
    );
    expect(container.querySelector("strong")?.textContent).toBe("50%");
    expect(container.textContent).toBe("Il 50% delle spese");
  });

  it("turns \\n into <br>", () => {
    const { container } = render(
      <p>
        <RichInline text={"riga uno\nriga due"} />
      </p>,
    );
    expect(container.querySelectorAll("br")).toHaveLength(1);
  });

  it("never parses HTML in the data", () => {
    const { container } = render(
      <p>
        <RichInline text={'<img src=x onerror="alert(1)">'} />
      </p>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img");
  });

  it("applies strongClassName", () => {
    const { container } = render(
      <RichInline text="**Causa:** tufo" strongClassName="text-foreground" />,
    );
    expect(container.querySelector("strong")?.className).toBe(
      "text-foreground",
    );
  });
});

describe("serializeJsonLd", () => {
  it("cannot close the surrounding <script>", () => {
    const out = serializeJsonLd({ text: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out)).toEqual({
      text: "</script><script>alert(1)</script>",
    });
  });
});
