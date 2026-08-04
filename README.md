# mcp-gdc

NCI Genomic Data Commons (GDC) MCP.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List NCI Genomic Data Commons cancer-genomics projects (TCGA, TARGET, CPTAC, etc.), ranked by case count. Returns project_id, name, program, primary site(s) and disease type(s). Keyless, open-access metadata. |
| `get_project` | Look up a single NCI GDC project by project_id (e.g. "TCGA-BRCA") and get its details plus summary counts (case_count, file_count). Keyless, open-access metadata. |
| `search_cases` | Search NCI GDC cancer cases (patients/samples) by primary site and/or project. Returns case_id, submitter_id, primary site, disease type and project_id. Keyless, open-access metadata. |
| `search_files` | Search NCI GDC genomic data files by project and/or data category (e.g. "Transcriptome Profiling", "Simple Nucleotide Variation", "DNA Methylation"). Returns file_id, file_name, data category/type/format, access level and file size. Keyless, open-access metadata. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "gdc": {
      "url": "https://gateway.pipeworx.io/gdc/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Gdc data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
