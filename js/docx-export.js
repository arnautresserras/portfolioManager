/* docx-export.js — client-side Word document generation matching the
   Week 28 template. Uses the vendored docx UMD library (window.docx). */
(function (global) {
  "use strict";

  var NAVY = "1F3864";
  var BODY_FONT = "Aptos";

  function fmtDate(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    if (p.length !== 3) return iso;
    var months = ["January","February","March","April","May","June",
      "July","August","September","October","November","December"];
    return months[(+p[1]) - 1] + " " + (+p[2]) + ", " + (+p[0]);
  }

  function build(state) {
    var d = global.docx;
    if (!d) throw new Error("docx library not loaded");

    var Document = d.Document, Paragraph = d.Paragraph, TextRun = d.TextRun,
        Table = d.Table, TableRow = d.TableRow, TableCell = d.TableCell,
        WidthType = d.WidthType, ShadingType = d.ShadingType,
        AlignmentType = d.AlignmentType, BorderStyle = d.BorderStyle,
        HeadingLevel = d.HeadingLevel, VerticalAlign = d.VerticalAlign;

    var catById = {};
    (state.statusCategories || []).forEach(function (c) { catById[c.id] = c; });
    function catColor(it) {
      var c = catById[it.statusCategory];
      return (c && c.color) ? c.color.replace("#", "") : "5F5E5A";
    }

    var thinBorder = { style: BorderStyle.SINGLE, size: 4, color: "D0D5DE" };
    var cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

    function shadedCell(text, fill, opts) {
      opts = opts || {};
      return new TableCell({
        width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
        shading: fill ? { type: ShadingType.CLEAR, color: "auto", fill: fill } : undefined,
        verticalAlign: VerticalAlign.CENTER,
        borders: cellBorders,
        margins: { top: 40, bottom: 40, left: 100, right: 100 },
        children: [new Paragraph({
          children: [new TextRun({
            text: text,
            bold: !!opts.bold,
            color: opts.color || "000000",
            font: BODY_FONT,
            size: opts.size || 20
          })]
        })]
      });
    }

    var children = [];

    /* ---- Title ---- */
    children.push(new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({
        text: state.report.title || "Digitalization Portfolio — Status Report",
        bold: true, size: 40, color: NAVY, font: BODY_FONT
      })]
    }));
    children.push(new Paragraph({
      spacing: { after: 220 },
      children: [new TextRun({
        text: "Week " + (state.report.week != null ? state.report.week : "?") +
              "  |  " + fmtDate(state.report.date),
        size: 22, color: "5C6270", font: BODY_FONT
      })]
    }));

    /* ---- Portfolio Assessment heading ---- */
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 120, after: 120 },
      children: [new TextRun({ text: "Portfolio Assessment", bold: true, size: 32, color: NAVY, font: BODY_FONT })]
    }));

    /* ---- Summary table ---- */
    var headerRow = new TableRow({
      tableHeader: true,
      children: ["Initiative", "Status", "Key signal"].map(function (t, i) {
        return shadedCell(t, NAVY, { color: "FFFFFF", bold: true, size: 20,
          width: i === 0 ? 32 : (i === 1 ? 22 : 46) });
      })
    });

    var bodyRows = [];
    (state.sections || []).forEach(function (sec) {
      itemsOf(state, sec.id).forEach(function (it) {
        bodyRows.push(new TableRow({
          children: [
            shadedCell(it.name, null, { width: 32, bold: false }),
            shadedCell(it.statusLabel || (catById[it.statusCategory] && catById[it.statusCategory].label) || "",
              catColor(it), { color: "FFFFFF", bold: true, width: 22 }),
            shadedCell(it.keySignal || "", null, { width: 46 })
          ]
        }));
      });
    });

    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow].concat(bodyRows)
    }));

    /* ---- Per-section detail blocks ---- */
    (state.sections || []).forEach(function (sec) {
      var items = itemsOf(state, sec.id);
      if (!items.length) return;

      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 320, after: 120 },
        children: [new TextRun({ text: sec.name.toUpperCase(), bold: true, size: 32, color: NAVY, font: BODY_FONT })]
      }));

      items.forEach(function (it) {
        /* mini table: name | STATUS badge */
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({
            children: [
              shadedCell(it.name, "F2F4F8", { bold: true, width: 74, size: 22 }),
              shadedCell(
                (it.statusLabel || (catById[it.statusCategory] && catById[it.statusCategory].label) || "").toUpperCase(),
                catColor(it), { color: "FFFFFF", bold: true, width: 26 })
            ]
          })]
        }));

        /* status line */
        if (it.statusLine) {
          children.push(new Paragraph({
            spacing: { before: 80, after: 40 },
            children: [
              new TextRun({ text: "Status: ", bold: true, size: 22, font: BODY_FONT }),
              new TextRun({ text: it.statusLine, size: 22, font: BODY_FONT })
            ]
          }));
        }

        /* detail bullets (leading tab/spaces => sub-bullet) */
        (it.detailBullets || []).forEach(function (b) {
          var isSub = /^[\t ]{1,}/.test(b);
          children.push(new Paragraph({
            bullet: { level: isSub ? 1 : 0 },
            spacing: { after: 20 },
            children: [new TextRun({ text: b.replace(/^[\t ]+/, ""), size: 22, font: BODY_FONT })]
          }));
        });

        /* next steps */
        (it.nextSteps || []).forEach(function (n, idx) {
          children.push(new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 20 },
            children: idx === 0
              ? [new TextRun({ text: "Next steps: ", bold: true, size: 22, font: BODY_FONT }),
                 new TextRun({ text: n, size: 22, font: BODY_FONT })]
              : [new TextRun({ text: n, size: 22, font: BODY_FONT })]
          }));
        });

        children.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
      });
    });

    var doc = new Document({
      styles: {
        default: {
          document: { run: { font: BODY_FONT, size: 22 } }
        }
      },
      sections: [{
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
        children: children
      }]
    });

    return doc;
  }

  function itemsOf(state, sectionId) {
    return (state.initiatives || [])
      .filter(function (i) { return i.sectionId === sectionId; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }

  function download(state) {
    var doc = build(state);
    var fname = "portfolio_status_week" +
      (state.report && state.report.week != null ? state.report.week : "") + ".docx";
    return global.docx.Packer.toBlob(doc).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = fname;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      return fname;
    });
  }

  global.PortfolioDocx = { build: build, download: download };
})(window);
