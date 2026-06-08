interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * NCI Genomic Data Commons (GDC) MCP.
 *
 * Keyless wrapper over the open NCI GDC REST API (https://api.gdc.cancer.gov):
 * browse cancer-genomics projects (TCGA/TARGET/etc), look up a project's
 * case/file counts, search cases by primary site or project, and search
 * genomic files by data category. Open-access metadata only.
 */


const BASE = 'https://api.gdc.cancer.gov';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'list_projects',
    description:
      'List NCI Genomic Data Commons cancer-genomics projects (TCGA, TARGET, CPTAC, etc.), ranked by case count. Returns project_id, name, program, primary site(s) and disease type(s). Keyless, open-access metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        size: { type: 'number', description: 'Number of projects to return (default 20, max 100).' },
        from: { type: 'number', description: 'Offset into the result set for pagination (default 0).' },
      },
    },
  },
  {
    name: 'get_project',
    description:
      'Look up a single NCI GDC project by project_id (e.g. "TCGA-BRCA") and get its details plus summary counts (case_count, file_count). Keyless, open-access metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'GDC project id, e.g. "TCGA-BRCA", "TARGET-AML".' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'search_cases',
    description:
      'Search NCI GDC cancer cases (patients/samples) by primary site and/or project. Returns case_id, submitter_id, primary site, disease type and project_id. Keyless, open-access metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        primary_site: { type: 'string', description: 'Primary anatomic site, e.g. "Kidney", "Breast", "Bronchus and lung".' },
        project_id: { type: 'string', description: 'Restrict to a GDC project, e.g. "TCGA-BRCA".' },
        size: { type: 'number', description: 'Number of cases to return (default 20).' },
      },
    },
  },
  {
    name: 'search_files',
    description:
      'Search NCI GDC genomic data files by project and/or data category (e.g. "Transcriptome Profiling", "Simple Nucleotide Variation", "DNA Methylation"). Returns file_id, file_name, data category/type/format, access level and file size. Keyless, open-access metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Restrict to a GDC project, e.g. "TCGA-BRCA".' },
        data_category: { type: 'string', description: 'Data category, e.g. "Transcriptome Profiling", "Simple Nucleotide Variation".' },
        size: { type: 'number', description: 'Number of files to return (default 20).' },
      },
    },
  },
];

interface Pagination {
  total?: number;
  count?: number;
  from?: number;
  size?: number;
}

async function gdcGet(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (!res.ok) {
    const body = await res.text().then((t) => t.slice(0, 200)).catch(() => '');
    throw new Error(`GDC: ${res.status} ${body}`);
  }
  return res.json();
}

function clampSize(v: unknown, def: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : def;
  if (n < 1) return def;
  return n > max ? max : n;
}

function nonNegInt(v: unknown, def: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : def;
  return n < 0 ? def : n;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

type Filter = { op: string; content: unknown };

function inFilter(field: string, value: string): Filter {
  return { op: 'in', content: { field, value: [value] } };
}

function combine(filters: Filter[]): Filter | undefined {
  if (filters.length === 0) return undefined;
  if (filters.length === 1) return filters[0];
  return { op: 'and', content: filters };
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'list_projects': {
        const size = clampSize(args.size, 20, 100);
        const from = nonNegInt(args.from, 0);
        const fields = 'project_id,name,primary_site,disease_type,program.name';
        const path = `/projects?size=${size}&from=${from}&format=json&fields=${encodeURIComponent(fields)}&sort=${encodeURIComponent('summary.case_count:desc')}`;
        const json = await gdcGet(path);
        const data = json?.data ?? {};
        const pagination: Pagination = data.pagination ?? {};
        const hits: any[] = Array.isArray(data.hits) ? data.hits : [];
        return {
          total: pagination.total,
          count: pagination.count ?? hits.length,
          projects: hits.map((h) => ({
            project_id: h.project_id,
            name: h.name,
            program: h.program?.name,
            primary_site: h.primary_site,
            disease_type: h.disease_type,
          })),
        };
      }

      case 'get_project': {
        const projectId = str(args.project_id);
        if (!projectId) return { error: 'Required argument "project_id" is missing. Pass a GDC project id like "TCGA-BRCA".' };
        let json: any;
        try {
          json = await gdcGet(`/projects/${encodeURIComponent(projectId)}?format=json&expand=summary`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes('GDC: 404')) return { error: 'project not found', project_id: projectId };
          return { error: msg };
        }
        const data = json?.data;
        if (!data || !data.project_id) return { error: 'project not found', project_id: projectId };
        return {
          project_id: data.project_id,
          name: data.name,
          program: data.program?.name,
          primary_site: data.primary_site,
          disease_type: data.disease_type,
          summary: data.summary,
        };
      }

      case 'search_cases': {
        const size = clampSize(args.size, 20, 100);
        const primarySite = str(args.primary_site);
        const projectId = str(args.project_id);
        const parts: Filter[] = [];
        if (primarySite) parts.push(inFilter('primary_site', primarySite));
        if (projectId) parts.push(inFilter('cases.project.project_id', projectId));
        const filter = combine(parts);
        const fields = 'case_id,submitter_id,primary_site,disease_type,project.project_id';
        let path = `/cases?size=${size}&format=json&fields=${encodeURIComponent(fields)}`;
        if (filter) path += `&filters=${encodeURIComponent(JSON.stringify(filter))}`;
        const json = await gdcGet(path);
        const data = json?.data ?? {};
        const pagination: Pagination = data.pagination ?? {};
        const hits: any[] = Array.isArray(data.hits) ? data.hits : [];
        return {
          total: pagination.total,
          count: pagination.count ?? hits.length,
          cases: hits.map((h) => ({
            case_id: h.case_id,
            submitter_id: h.submitter_id,
            primary_site: h.primary_site,
            disease_type: h.disease_type,
            project_id: h.project?.project_id,
          })),
        };
      }

      case 'search_files': {
        const size = clampSize(args.size, 20, 100);
        const projectId = str(args.project_id);
        const dataCategory = str(args.data_category);
        const parts: Filter[] = [];
        if (projectId) parts.push(inFilter('cases.project.project_id', projectId));
        if (dataCategory) parts.push(inFilter('data_category', dataCategory));
        const filter = combine(parts);
        const fields = 'file_id,file_name,data_category,data_type,data_format,access,file_size';
        let path = `/files?size=${size}&format=json&fields=${encodeURIComponent(fields)}`;
        if (filter) path += `&filters=${encodeURIComponent(JSON.stringify(filter))}`;
        const json = await gdcGet(path);
        const data = json?.data ?? {};
        const pagination: Pagination = data.pagination ?? {};
        const hits: any[] = Array.isArray(data.hits) ? data.hits : [];
        return {
          total: pagination.total,
          count: pagination.count ?? hits.length,
          files: hits.map((h) => ({
            file_id: h.file_id,
            file_name: h.file_name,
            data_category: h.data_category,
            data_type: h.data_type,
            data_format: h.data_format,
            access: h.access,
            file_size: h.file_size,
          })),
        };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
