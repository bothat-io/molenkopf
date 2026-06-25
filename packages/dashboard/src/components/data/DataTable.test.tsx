import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataTable } from "./DataTable";

describe("DataTable", () => {
  it("renders wrapped table structure with widths and cell classes", () => {
    const html = renderToString(<DataTable
      className="sample-table"
      rows={[{ id: "a", value: 42 }]}
      rowKey={(row) => row.id}
      columns={[
        { key: "name", header: "Name", width: "70%", cell: (row) => row.id },
        { key: "value", header: "Value", width: "30%", className: "num", align: "right", cell: (row) => row.value }
      ]}
    />);

    expect(html).toContain("dtable-wrap");
    expect(html).toContain("dtable data-table sample-table");
    expect(html).toContain("width:70%");
    expect(html).toContain("num is-right");
    expect(html).toContain("<td");
  });

  it("renders the provided empty state without table chrome", () => {
    const html = renderToString(<DataTable rows={[]} rowKey={() => "x"} columns={[]} empty={<div className="empty">Nothing here.</div>} />);

    expect(html).toContain("Nothing here.");
    expect(html).not.toContain("<table");
  });

  it("applies optional row attributes", () => {
    const html = renderToString(<DataTable rows={[{ id: "drag" }]} rowKey={(row) => row.id} rowProps={() => ({ draggable: true, title: "Move row" })} columns={[{ key: "id", header: "ID", cell: (row) => row.id }]} />);

    expect(html).toContain("draggable=\"true\"");
    expect(html).toContain("title=\"Move row\"");
  });
});
