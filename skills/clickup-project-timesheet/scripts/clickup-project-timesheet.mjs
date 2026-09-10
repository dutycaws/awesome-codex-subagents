#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

import {
  DEFAULT_CALLS_PER_MINUTE,
  RollingWindowRateLimiter,
} from "./rate-limit.mjs";

const API_BASE_URL = "https://api.clickup.com/api/v2";
const REQUIRED_PROJECT_TABS = ["Project Battlestar", "Project Arrakis"];
const RESERVED_TABS = new Set(["Raw Entries", "Run Info"]);
const HOURS_DIVISOR = 3_600_000;
const DAY_MS = 86_400_000;
const MAX_RETRIES = 5;
const FONT_FAMILY = "Arial";
const COLORS = {
  navy: "#1F4E78",
  blue: "#4472C4",
  lightBlue: "#D9EAF7",
  paleBlue: "#EAF2F8",
  gray: "#E7E6E6",
  darkGray: "#595959",
  paleRed: "#FCE4D6",
  red: "#C00000",
  white: "#FFFFFF",
  text: "#1F2937",
};

function printHelp() {
  console.log(`Usage:
  node scripts/clickup-project-timesheet.mjs \\
    --config /absolute/path/config.json \\
    --start YYYY-MM-DD --end YYYY-MM-DD \\
    --output /absolute/path/timesheet.xlsx \\
    [--time-zone America/Chicago] \\
    [--token-file /absolute/path/token.txt] \\
    [--max-calls-per-minute 75] \\
    [--preview-dir /absolute/path/previews] \\
    [--audit-json /absolute/path/extract.json]

Fixture/rebuild mode:
  node scripts/clickup-project-timesheet.mjs \\
    --input-json /absolute/path/normalized.json \\
    --output /absolute/path/timesheet.xlsx \\
    [--preview-dir /absolute/path/previews]

The end date is exclusive. The token is read from CLICKUP_API_TOKEN, --token-file,
or exactly one plausible file under ./secrets. Values of 80 or more for
--max-calls-per-minute are rejected before any network call.`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2).replaceAll("-", "_");
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${token}.`);
    }
    args[key] = value;
    index += 1;
  }
  return args;
}

function requiredArgument(args, name) {
  const value = args[name];
  if (!value) {
    throw new Error(`Missing required --${name.replaceAll("_", "-")} argument.`);
  }
  return value;
}

async function readJson(filePath) {
  const contents = await fs.readFile(filePath, "utf8");
  return JSON.parse(contents);
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return normalizeText(value).toLocaleLowerCase("en-US");
}

function normalizeId(value) {
  const result = normalizeText(value);
  return result || null;
}

function validateDateString(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} is not a valid date.`);
  }
}

function validateTimeZone(value) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
  } catch {
    throw new Error(`Invalid IANA time zone: ${value}`);
  }
}

function toLocalMidnightEpoch(dateString) {
  return new Date(`${dateString}T00:00:00`).getTime();
}

function localDateString(epochMs, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(epochMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatGeneratedAt(epochMs, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(epochMs));
}

async function resolveToken(args) {
  const environmentToken = normalizeText(process.env.CLICKUP_API_TOKEN);
  if (environmentToken) {
    return environmentToken;
  }

  let tokenFile = args.token_file;
  if (!tokenFile) {
    const secretsDirectory = path.join(process.cwd(), "secrets");
    let candidates = [];
    try {
      const entries = await fs.readdir(secretsDirectory, { withFileTypes: true });
      candidates = entries
        .filter(
          (entry) =>
            entry.isFile() &&
            /clickup/i.test(entry.name) &&
            /(token|api|key)/i.test(entry.name),
        )
        .map((entry) => path.join(secretsDirectory, entry.name));
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    if (candidates.length !== 1) {
      throw new Error(
        `Expected exactly one plausible ClickUp token file under ${secretsDirectory}; found ${candidates.length}. Use --token-file or CLICKUP_API_TOKEN.`,
      );
    }
    [tokenFile] = candidates;
  }

  const raw = normalizeText(await fs.readFile(tokenFile, "utf8"));
  if (!raw) {
    throw new Error("The selected ClickUp token file is empty.");
  }
  if (raw.startsWith("{")) {
    const parsed = JSON.parse(raw);
    const token = normalizeText(parsed.token ?? parsed.api_token ?? parsed.apiToken);
    if (!token) {
      throw new Error("The token JSON does not contain token, api_token, or apiToken.");
    }
    return token;
  }
  return raw;
}

async function sleepInChunks(milliseconds) {
  let remaining = Math.max(0, milliseconds);
  while (remaining > 0) {
    const chunk = Math.min(remaining, 30_000);
    await new Promise((resolve) => setTimeout(resolve, chunk));
    remaining -= chunk;
  }
}

function retryAfterMilliseconds(headerValue) {
  const value = normalizeText(headerValue);
  if (!value) {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(300_000, Math.ceil(seconds * 1_000));
  }
  const dateValue = Date.parse(value);
  if (Number.isFinite(dateValue)) {
    return Math.min(300_000, Math.max(0, dateValue - Date.now()));
  }
  return null;
}

class ClickUpClient {
  constructor(token, maxCallsPerMinute) {
    this.token = token;
    this.limiter = new RollingWindowRateLimiter({ maxCallsPerMinute });
    this.calls = [];
    this.requestQueue = Promise.resolve();
  }

  get(resourcePath, query = {}) {
    const request = this.requestQueue.then(() => this.getSerial(resourcePath, query));
    this.requestQueue = request.catch(() => undefined);
    return request;
  }

  async getSerial(resourcePath, query = {}) {
    const url = new URL(`${API_BASE_URL}${resourcePath}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt += 1) {
      await this.limiter.waitForTurn();
      const startedAt = Date.now();
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: this.token,
            Accept: "application/json",
            "User-Agent": "codex-clickup-project-timesheet/1.0",
          },
        });
        const elapsedMs = Date.now() - startedAt;
        this.calls.push({
          method: "GET",
          path: resourcePath,
          status: response.status,
          attempt,
          elapsed_ms: elapsedMs,
        });

        if (response.ok) {
          return await response.json();
        }

        const body = normalizeText(await response.text()).slice(0, 500);
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt > MAX_RETRIES) {
          throw new Error(
            `ClickUp GET ${resourcePath} failed with HTTP ${response.status}${body ? `: ${body}` : "."}`,
          );
        }
        const retryAfter = retryAfterMilliseconds(response.headers.get("retry-after"));
        const backoff = retryAfter ?? Math.min(30_000, 1_000 * 2 ** (attempt - 1));
        await sleepInChunks(backoff + 250);
      } catch (error) {
        if (error.message.startsWith("ClickUp GET")) {
          throw error;
        }
        this.calls.push({
          method: "GET",
          path: resourcePath,
          status: "NETWORK_ERROR",
          attempt,
          elapsed_ms: Date.now() - startedAt,
        });
        if (attempt > MAX_RETRIES) {
          throw new Error(`ClickUp GET ${resourcePath} failed after retries: ${error.message}`);
        }
        await sleepInChunks(Math.min(30_000, 1_000 * 2 ** (attempt - 1)));
      }
    }
    throw new Error(`ClickUp GET ${resourcePath} exhausted its retry loop.`);
  }
}

function normalizeListConfig(rawList) {
  if (typeof rawList === "string" || typeof rawList === "number") {
    return { id: String(rawList), name: "Configured list", folder: "" };
  }
  if (!rawList || typeof rawList !== "object" || !normalizeId(rawList.id)) {
    throw new Error("Every list_ids item must be an ID string or an object with id.");
  }
  return {
    id: String(rawList.id),
    name: normalizeText(rawList.name) || "Configured list",
    folder: normalizeText(rawList.folder),
  };
}

function validateConfig(config) {
  if (!config || typeof config !== "object") {
    throw new Error("Config must be a JSON object.");
  }
  if (!Array.isArray(config.projects)) {
    throw new Error("Config projects must be an array.");
  }
  const tabNames = config.projects.map((project) => normalizeText(project.tab_name));
  for (const requiredTab of REQUIRED_PROJECT_TABS) {
    if (!tabNames.includes(requiredTab)) {
      throw new Error(`Config must include a project with tab_name ${requiredTab}.`);
    }
  }
  const duplicateTabs = tabNames.filter(
    (tabName, index) => tabNames.indexOf(tabName) !== index,
  );
  if (duplicateTabs.length > 0) {
    throw new Error(`Project tab names must be unique: ${duplicateTabs.join(", ")}`);
  }
  for (const tabName of tabNames) {
    if (!tabName || tabName.length > 31 || RESERVED_TABS.has(tabName)) {
      throw new Error(`Invalid or reserved Excel tab name: ${tabName || "(blank)"}`);
    }
  }
  const sliceDays = Number(config.time_entry_slice_days ?? 31);
  if (!Number.isInteger(sliceDays) || sliceDays < 1 || sliceDays > 366) {
    throw new Error("time_entry_slice_days must be an integer from 1 through 366.");
  }
  return {
    workspace_id: normalizeId(config.workspace_id),
    workspace_name: normalizeText(config.workspace_name),
    project_code_field: normalizeText(config.project_code_field) || "Project Code",
    time_entry_slice_days: sliceDays,
    projects: config.projects.map((project, index) => ({
      key: normalizeText(project.key) || `project-${index + 1}`,
      name: normalizeText(project.name) || normalizeText(project.tab_name),
      tab_name: normalizeText(project.tab_name),
      space_id: normalizeId(project.space_id),
      space_names: Array.isArray(project.space_names)
        ? project.space_names.map(normalizeText).filter(Boolean)
        : [],
      list_ids: Array.isArray(project.list_ids)
        ? project.list_ids.map(normalizeListConfig)
        : [],
      list_names: Array.isArray(project.list_names)
        ? project.list_names.map(normalizeText).filter(Boolean)
        : [],
    })),
  };
}

function selectWorkspace(teams, config) {
  if (!Array.isArray(teams) || teams.length === 0) {
    throw new Error("The ClickUp token exposes no workspaces.");
  }
  if (config.workspace_id) {
    const matches = teams.filter((team) => String(team.id) === config.workspace_id);
    if (matches.length !== 1) {
      throw new Error(`Workspace ID ${config.workspace_id} was not returned by ClickUp.`);
    }
    return matches[0];
  }
  if (config.workspace_name) {
    const matches = teams.filter((team) => lower(team.name) === lower(config.workspace_name));
    if (matches.length !== 1) {
      throw new Error(
        `Expected one workspace named ${config.workspace_name}; found ${matches.length}.`,
      );
    }
    return matches[0];
  }
  if (teams.length !== 1) {
    throw new Error(
      `The token exposes ${teams.length} workspaces. Configure workspace_id or workspace_name.`,
    );
  }
  return teams[0];
}

function selectSpace(project, spaces) {
  if (project.space_id) {
    const known = spaces.find((space) => String(space.id) === project.space_id);
    return {
      id: project.space_id,
      name: normalizeText(known?.name) || project.name,
    };
  }
  if (project.space_names.length === 0) {
    throw new Error(`${project.name} needs space_id or at least one space_names alias.`);
  }
  for (const alias of project.space_names) {
    const matches = spaces.filter((space) => lower(space.name) === lower(alias));
    if (matches.length === 1) {
      return { id: String(matches[0].id), name: normalizeText(matches[0].name) };
    }
    if (matches.length > 1) {
      throw new Error(`Space alias ${alias} matched more than one space.`);
    }
  }
  throw new Error(
    `${project.name} did not match any active space alias: ${project.space_names.join(", ")}`,
  );
}

function collectWorkspaceMemberIds(workspace) {
  const members = Array.isArray(workspace.members) ? workspace.members : [];
  return [
    ...new Set(
      members
        .map((member) => normalizeId(member?.user?.id ?? member?.id))
        .filter(Boolean),
    ),
  ];
}

async function discoverLists(client, project, space) {
  if (project.list_ids.length > 0) {
    return project.list_ids;
  }
  const folderResponse = await client.get(`/space/${space.id}/folder`, {
    archived: false,
  });
  const folderlessResponse = await client.get(`/space/${space.id}/list`, {
    archived: false,
  });
  const lists = [];
  for (const folder of folderResponse.folders ?? []) {
    for (const list of folder.lists ?? []) {
      lists.push({
        id: String(list.id),
        name: normalizeText(list.name) || "Unnamed list",
        folder: normalizeText(folder.name),
      });
    }
  }
  for (const list of folderlessResponse.lists ?? []) {
    lists.push({
      id: String(list.id),
      name: normalizeText(list.name) || "Unnamed list",
      folder: "",
    });
  }
  const unique = [...new Map(lists.map((list) => [list.id, list])).values()];
  if (project.list_names.length === 0) {
    return unique;
  }
  const wanted = new Set(project.list_names.map(lower));
  const filtered = unique.filter((list) => wanted.has(lower(list.name)));
  const found = new Set(filtered.map((list) => lower(list.name)));
  const missing = [...wanted].filter((name) => !found.has(name));
  if (missing.length > 0) {
    throw new Error(`${project.name} is missing configured list names: ${missing.join(", ")}`);
  }
  return filtered;
}

async function fetchTasksForList(client, list) {
  const tasks = [];
  for (let page = 0; page < 10_000; page += 1) {
    const response = await client.get(`/list/${list.id}/task`, {
      archived: false,
      include_closed: true,
      subtasks: true,
      page,
    });
    const pageTasks = Array.isArray(response.tasks) ? response.tasks : [];
    for (const task of pageTasks) {
      tasks.push({
        ...task,
        _source_list_id: list.id,
        _source_list_name: list.name,
        _source_folder_name: list.folder,
      });
    }
    if (response.last_page === true || pageTasks.length === 0 || pageTasks.length < 100) {
      return tasks;
    }
  }
  throw new Error(`Task pagination exceeded 10,000 pages for list ${list.id}.`);
}

function splitInterval(startMs, endMs, sliceDays) {
  const intervals = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const next = Math.min(endMs, cursor + sliceDays * DAY_MS);
    intervals.push({ start: cursor, end: next });
    cursor = next;
  }
  return intervals;
}

async function fetchTimeEntries(
  client,
  workspaceId,
  memberIds,
  spaceId,
  startMs,
  endMs,
  sliceDays,
) {
  const byId = new Map();
  const warnings = [];
  const intervals = splitInterval(startMs, endMs, sliceDays);
  for (const interval of intervals) {
    const response = await client.get(`/team/${workspaceId}/time_entries`, {
      start_date: interval.start,
      end_date: interval.end - 1,
      assignee: memberIds.length > 0 ? memberIds.join(",") : undefined,
      include_task_tags: true,
      include_location_names: true,
      include_approval_details: true,
      space_id: spaceId,
    });
    const entries = Array.isArray(response.data) ? response.data : [];
    if (entries.length >= 10_000) {
      warnings.push(
        `A time-entry slice returned ${entries.length} rows; verify ClickUp did not truncate the response.`,
      );
    }
    for (const entry of entries) {
      const id = normalizeId(entry.id);
      if (id) {
        byId.set(id, entry);
      }
    }
  }
  return { entries: [...byId.values()], intervals, warnings };
}

function findProjectCode(task, fieldName) {
  if (!task) {
    return {
      project_code: "",
      coding_status: "Task unavailable in current snapshot",
      is_coded: false,
    };
  }
  const fields = Array.isArray(task.custom_fields) ? task.custom_fields : [];
  const field = fields.find((candidate) => lower(candidate.name) === lower(fieldName));
  if (!field) {
    return {
      project_code: "",
      coding_status: "Project Code field unavailable",
      is_coded: false,
    };
  }
  const value = field.value;
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return {
      project_code: "",
      coding_status: "Project Code blank",
      is_coded: false,
    };
  }

  const options = Array.isArray(field.type_config?.options)
    ? field.type_config.options
    : [];
  const comparable =
    typeof value === "object" && !Array.isArray(value)
      ? value.id ?? value.value ?? value.name
      : value;
  const match = options.find(
    (option) =>
      String(option.id) === String(comparable) ||
      String(option.orderindex) === String(comparable) ||
      lower(option.name) === lower(comparable),
  );
  if (match?.name) {
    return {
      project_code: normalizeText(match.name),
      coding_status: "Coded",
      is_coded: true,
    };
  }
  return {
    project_code: normalizeText(comparable) || JSON.stringify(value),
    coding_status: "Unknown dropdown option",
    is_coded: false,
  };
}

function personDetails(entry) {
  const user = entry.user ?? entry.assignee ?? {};
  const personId = normalizeText(user.id ?? entry.user_id);
  const person =
    normalizeText(user.username) ||
    normalizeText(user.name) ||
    normalizeText(user.email) ||
    (personId ? `User ${personId}` : "Unknown person");
  return { person, person_id: personId };
}

function tagNames(entry) {
  const tags = Array.isArray(entry.tags)
    ? entry.tags
    : Array.isArray(entry.task?.tags)
      ? entry.task.tags
      : [];
  return tags
    .map((tag) => normalizeText(tag?.name ?? tag))
    .filter(Boolean)
    .join(", ");
}

function normalizeEntry(entry, project, space, taskMap, timeZone, fieldName) {
  const taskId = normalizeText(entry.task?.id ?? entry.task_id);
  const task = taskMap.get(taskId);
  const durationMs = Number(entry.duration);
  const durationValid = Number.isFinite(durationMs) && durationMs >= 0;
  const startMs = Number(entry.start);
  const validStart = Number.isFinite(startMs);
  const endMs = durationValid && validStart ? startMs + durationMs : null;
  const person = personDetails(entry);
  const coding = findProjectCode(task, fieldName);
  const location = entry.location ?? {};
  return {
    project: project.name,
    project_key: project.key,
    project_tab: project.tab_name,
    person: person.person,
    person_id: person.person_id,
    work_date: validStart ? localDateString(startMs, timeZone) : "",
    start_ms: validStart ? startMs : null,
    end_ms: endMs,
    hours: durationValid ? durationMs / HOURS_DIVISOR : null,
    duration_status: durationValid ? "Complete" : "Running or invalid duration",
    duration_valid: durationValid,
    project_code: coding.project_code,
    coding_status: coding.coding_status,
    is_coded: coding.is_coded,
    task_id: taskId,
    task_name: normalizeText(task?.name ?? entry.task?.name) || "Task unavailable",
    list_name:
      normalizeText(task?._source_list_name) ||
      normalizeText(location.list_name ?? location.list?.name),
    folder_name:
      normalizeText(task?._source_folder_name) ||
      normalizeText(location.folder_name ?? location.folder?.name),
    space_name: normalizeText(space.name) || normalizeText(location.space_name),
    time_entry_id: normalizeText(entry.id),
    billable:
      entry.billable === true ? "Yes" : entry.billable === false ? "No" : "Unknown",
    description: normalizeText(entry.description),
    tags: tagNames(entry),
    task_url:
      normalizeText(task?.url) || (taskId ? `https://app.clickup.com/t/${taskId}` : ""),
  };
}

async function collectLiveDataset(args, config) {
  const maxCallsPerMinute = Number(args.max_calls_per_minute ?? DEFAULT_CALLS_PER_MINUTE);
  // Validate the requested ceiling before reading a credential or attempting authentication.
  new RollingWindowRateLimiter({ maxCallsPerMinute });
  const token = await resolveToken(args);
  const client = new ClickUpClient(token, maxCallsPerMinute);
  const teamsResponse = await client.get("/team");
  const workspace = selectWorkspace(teamsResponse.teams ?? [], config);
  const workspaceId = String(workspace.id);
  const memberIds = collectWorkspaceMemberIds(workspace);
  const needsSpaces = config.projects.some((project) => !project.space_id);
  const spaces = needsSpaces
    ? (await client.get(`/team/${workspaceId}/space`, { archived: false })).spaces ?? []
    : [];
  const startMs = toLocalMidnightEpoch(args.start);
  const endMs = toLocalMidnightEpoch(args.end);
  const projects = [];
  const allTimeEntryIds = new Set();

  for (const project of config.projects) {
    const space = selectSpace(project, spaces);
    const lists = await discoverLists(client, project, space);
    if (lists.length === 0) {
      throw new Error(`${project.name} resolved to zero active lists.`);
    }
    const taskMap = new Map();
    for (const list of lists) {
      const tasks = await fetchTasksForList(client, list);
      for (const task of tasks) {
        const taskId = normalizeId(task.id);
        if (taskId) {
          taskMap.set(taskId, task);
        }
      }
    }
    const timeResult = await fetchTimeEntries(
      client,
      workspaceId,
      memberIds,
      space.id,
      startMs,
      endMs,
      config.time_entry_slice_days,
    );
    const normalizedEntries = timeResult.entries.map((entry) =>
      normalizeEntry(entry, project, space, taskMap, args.time_zone, config.project_code_field),
    );
    for (const entry of normalizedEntries) {
      if (entry.time_entry_id && allTimeEntryIds.has(entry.time_entry_id)) {
        throw new Error(
          `Time entry ${entry.time_entry_id} was returned for more than one configured project.`,
        );
      }
      if (entry.time_entry_id) {
        allTimeEntryIds.add(entry.time_entry_id);
      }
    }
    projects.push({
      key: project.key,
      name: project.name,
      tab_name: project.tab_name,
      source: {
        space_id: space.id,
        space_name: space.name,
        list_count: lists.length,
        task_count: taskMap.size,
        time_slice_count: timeResult.intervals.length,
        warnings: timeResult.warnings,
        lists,
      },
      entries: normalizedEntries,
    });
  }

  const generatedAt = Date.now();
  return {
    schema_version: 1,
    run: {
      generated_at_ms: generatedAt,
      generated_at_local: formatGeneratedAt(generatedAt, args.time_zone),
      start_date: args.start,
      end_date: args.end,
      interval_semantics: "Start inclusive; end exclusive",
      time_zone: args.time_zone,
      workspace_id: workspaceId,
      workspace_name: normalizeText(workspace.name),
      project_code_field: config.project_code_field,
      max_calls_per_minute: maxCallsPerMinute,
      minimum_request_interval_ms: client.limiter.minimumIntervalMs,
      api_call_attempts: client.calls.length,
      api_calls: client.calls,
      source: "ClickUp REST API v2",
    },
    projects,
  };
}

function validateDataset(dataset) {
  if (
    !dataset ||
    typeof dataset !== "object" ||
    !dataset.run ||
    typeof dataset.run !== "object" ||
    !Array.isArray(dataset.projects)
  ) {
    throw new Error("Normalized input JSON must contain a run object and projects array.");
  }
  for (const requiredTab of REQUIRED_PROJECT_TABS) {
    if (!dataset.projects.some((project) => project.tab_name === requiredTab)) {
      throw new Error(`Normalized input is missing required tab ${requiredTab}.`);
    }
  }
  const tabNames = dataset.projects.map((project) => project.tab_name);
  if (new Set(tabNames).size !== tabNames.length) {
    throw new Error("Normalized input contains duplicate project tab names.");
  }
  for (const project of dataset.projects) {
    if (
      !normalizeText(project.tab_name) ||
      project.tab_name.length > 31 ||
      RESERVED_TABS.has(project.tab_name)
    ) {
      throw new Error(`Normalized input contains an invalid tab name: ${project.tab_name}.`);
    }
    if (!Array.isArray(project.entries)) {
      throw new Error(`Project ${project.name ?? project.tab_name} is missing entries.`);
    }
  }
  return dataset;
}

function validEntries(entries) {
  return entries.filter(
    (entry) =>
      entry.duration_valid !== false &&
      Number.isFinite(Number(entry.hours)) &&
      Number(entry.hours) >= 0,
  );
}

function sumHours(entries) {
  return validEntries(entries).reduce((total, entry) => total + Number(entry.hours), 0);
}

function projectSummary(project) {
  const valid = validEntries(project.entries);
  const coded = valid.filter((entry) => entry.is_coded === true);
  const uncoded = valid.filter((entry) => entry.is_coded !== true);
  const totalHours = sumHours(valid);
  const codedHours = sumHours(coded);
  const uncodedHours = sumHours(uncoded);
  return {
    total_hours: totalHours,
    coded_hours: codedHours,
    uncoded_hours: uncodedHours,
    coverage: totalHours > 0 ? codedHours / totalHours : null,
    valid_entries: valid.length,
    invalid_entries: project.entries.length - valid.length,
  };
}

function aggregateMatrix(project) {
  const entries = validEntries(project.entries);
  const projectCodes = [
    ...new Set(
      entries
        .filter((entry) => entry.is_coded === true)
        .map((entry) => normalizeText(entry.project_code))
        .filter(Boolean),
    ),
  ].sort((left, right) => left.localeCompare(right));
  const persons = [...new Set(entries.map((entry) => entry.person))].sort((left, right) =>
    left.localeCompare(right),
  );
  const rows = persons.map((person) => {
    const personEntries = entries.filter((entry) => entry.person === person);
    const codeHours = projectCodes.map((code) =>
      sumHours(
        personEntries.filter(
          (entry) => entry.is_coded === true && entry.project_code === code,
        ),
      ),
    );
    const uncodedHours = sumHours(personEntries.filter((entry) => entry.is_coded !== true));
    return [person, ...codeHours, uncodedHours, sumHours(personEntries)];
  });
  return { projectCodes, rows };
}

function aggregateCodes(project) {
  const entries = validEntries(project.entries);
  const labels = [
    ...new Set(
      entries.map((entry) =>
        entry.is_coded === true && normalizeText(entry.project_code)
          ? entry.project_code
          : "Uncoded",
      ),
    ),
  ].sort((left, right) => {
    if (left === "Uncoded") return 1;
    if (right === "Uncoded") return -1;
    return left.localeCompare(right);
  });
  return labels.map((label) => {
    const matching = entries.filter((entry) =>
      label === "Uncoded"
        ? entry.is_coded !== true
        : entry.is_coded === true && entry.project_code === label,
    );
    return [label, sumHours(matching), matching.length];
  });
}

function excelColumn(index) {
  let number = index + 1;
  let result = "";
  while (number > 0) {
    const remainder = (number - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    number = Math.floor((number - 1) / 26);
  }
  return result;
}

function safeTableName(prefix, tabName, sequence) {
  const base = `${prefix}_${tabName}`.replace(/[^A-Za-z0-9_]/g, "_");
  const startsWithLetter = /^[A-Za-z_]/.test(base) ? base : `T_${base}`;
  return `${startsWithLetter.slice(0, 220)}_${sequence}`;
}

function setWidths(sheet, widths, rowCount) {
  widths.forEach((width, columnIndex) => {
    sheet
      .getRangeByIndexes(0, columnIndex, Math.max(rowCount, 1), 1)
      .format.columnWidth = width;
  });
}

function styleTitle(sheet, address) {
  sheet.getRange(address).format = {
    font: { name: FONT_FAMILY, size: 14, bold: true, color: COLORS.text },
  };
}

function styleSection(sheet, address) {
  sheet.getRange(address).format = {
    fill: COLORS.lightBlue,
    font: { name: FONT_FAMILY, size: 10, bold: true, color: COLORS.text },
    borders: { preset: "outside", style: "thin", color: COLORS.blue },
  };
}

function styleHeader(sheet, address) {
  sheet.getRange(address).format = {
    fill: COLORS.navy,
    font: { name: FONT_FAMILY, size: 10, bold: true, color: COLORS.white },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "inside", style: "thin", color: COLORS.white },
  };
}

function addTable(sheet, rangeAddress, name) {
  const table = sheet.tables.add(rangeAddress, true, name);
  table.style = "TableStyleMedium2";
  table.showFilterButton = true;
  return table;
}

function buildProjectSheet(workbook, dataset, project, projectIndex) {
  const sheet = workbook.worksheets.add(project.tab_name);
  sheet.showGridLines = false;
  sheet.tabColor = projectIndex === 0 ? COLORS.navy : COLORS.blue;
  const summary = projectSummary(project);
  const matrix = aggregateMatrix(project);
  const matrixHeaders = ["Person", ...matrix.projectCodes, "Uncoded", "Total"];
  const matrixRows = matrix.rows.length > 0
    ? matrix.rows
    : [["No valid time entries", ...matrix.projectCodes.map(() => 0), 0, 0]];

  sheet.getRange("A2").values = [[`${project.name} timesheet`]];
  styleTitle(sheet, "A2");
  sheet.getRange("A3").values = [[
    `${dataset.run.start_date} through ${dataset.run.end_date} (end exclusive), ${dataset.run.time_zone}`,
  ]];
  sheet.getRange("A3").format.font = {
    name: FONT_FAMILY,
    size: 10,
    italic: true,
    color: COLORS.darkGray,
  };
  sheet.getRange("A5:F5").values = [[
    "Total hours",
    "Coded hours",
    "Uncoded hours",
    "Coding coverage",
    "Valid entries",
    "Excluded entries",
  ]];
  styleHeader(sheet, "A5:F5");
  sheet.getRange("A6:F6").values = [[
    summary.total_hours,
    summary.coded_hours,
    summary.uncoded_hours,
    summary.coverage ?? "n.a.",
    summary.valid_entries,
    summary.invalid_entries,
  ]];
  sheet.getRange("A6:C6").format.numberFormat = "0.00";
  if (summary.coverage !== null) {
    sheet.getRange("D6").format.numberFormat = "0.0%";
  }
  sheet.getRange("E6:F6").format.numberFormat = "#,##0";
  sheet.getRange("A6:F6").format.font = { name: FONT_FAMILY, size: 11, bold: true };
  sheet.getRange("D6").format.font = { name: FONT_FAMILY, size: 11, bold: true };

  sheet.getRange("A9").values = [["Hours by person and Project Code"]];
  styleSection(sheet, `A9:${excelColumn(matrixHeaders.length - 1)}9`);
  const matrixHeaderRow = 10;
  const matrixLastRow = matrixHeaderRow + matrixRows.length;
  const matrixLastColumn = excelColumn(matrixHeaders.length - 1);
  sheet.getRange(`A${matrixHeaderRow}:${matrixLastColumn}${matrixHeaderRow}`).values = [matrixHeaders];
  sheet.getRange(`A${matrixHeaderRow}:${matrixLastColumn}${matrixLastRow}`).write([
    matrixHeaders,
    ...matrixRows,
  ]);
  sheet.getRange(`A${matrixHeaderRow}:${matrixLastColumn}${matrixLastRow}`).format.font = {
    name: FONT_FAMILY,
    size: 10,
  };
  addTable(
    sheet,
    `A${matrixHeaderRow}:${matrixLastColumn}${matrixLastRow}`,
    safeTableName("Matrix", project.tab_name, projectIndex + 1),
  );
  styleHeader(sheet, `A${matrixHeaderRow}:${matrixLastColumn}${matrixHeaderRow}`);
  if (matrixHeaders.length > 1) {
    sheet
      .getRange(`B${matrixHeaderRow + 1}:${matrixLastColumn}${matrixLastRow}`)
      .format.numberFormat = "0.00";
  }

  const codeTitleRow = matrixLastRow + 3;
  const codeHeaderRow = codeTitleRow + 1;
  const codeRows = aggregateCodes(project);
  const codeData = codeRows.length > 0 ? codeRows : [["No valid time entries", 0, 0]];
  const codeLastRow = codeHeaderRow + codeData.length;
  sheet.getRange(`A${codeTitleRow}`).values = [["Project Code summary"]];
  styleSection(sheet, `A${codeTitleRow}:C${codeTitleRow}`);
  sheet.getRange(`A${codeHeaderRow}:C${codeLastRow}`).write([
    ["Project Code", "Hours", "Entries"],
    ...codeData,
  ]);
  sheet.getRange(`A${codeHeaderRow}:C${codeLastRow}`).format.font = {
    name: FONT_FAMILY,
    size: 10,
  };
  addTable(
    sheet,
    `A${codeHeaderRow}:C${codeLastRow}`,
    safeTableName("Codes", project.tab_name, projectIndex + 1),
  );
  styleHeader(sheet, `A${codeHeaderRow}:C${codeHeaderRow}`);
  sheet.getRange(`B${codeHeaderRow + 1}:B${codeLastRow}`).format.numberFormat = "0.00";
  sheet.getRange(`C${codeHeaderRow + 1}:C${codeLastRow}`).format.numberFormat = "#,##0";

  const exceptionTitleRow = codeLastRow + 3;
  const exceptionHeaderRow = exceptionTitleRow + 1;
  const exceptionEntries = project.entries
    .filter((entry) => entry.is_coded !== true || entry.duration_valid === false)
    .sort((left, right) =>
      `${left.person}|${left.work_date}|${left.task_name}`.localeCompare(
        `${right.person}|${right.work_date}|${right.task_name}`,
      ),
    );
  const exceptionRows = exceptionEntries.length > 0
    ? exceptionEntries.map((entry) => [
        entry.person,
        entry.work_date ? new Date(`${entry.work_date}T00:00:00`) : null,
        entry.task_name,
        entry.hours !== null &&
        entry.hours !== undefined &&
        Number.isFinite(Number(entry.hours))
          ? Number(entry.hours)
          : null,
        entry.duration_status,
        entry.coding_status,
      ])
    : [["No exceptions", null, "", null, "", ""]];
  const exceptionLastRow = exceptionHeaderRow + exceptionRows.length;
  sheet.getRange(`A${exceptionTitleRow}`).values = [["Uncoded and excluded entries"]];
  styleSection(sheet, `A${exceptionTitleRow}:F${exceptionTitleRow}`);
  sheet.getRange(`A${exceptionHeaderRow}:F${exceptionLastRow}`).write([
    ["Person", "Work Date", "Task", "Hours", "Duration Status", "Coding Status"],
    ...exceptionRows,
  ]);
  sheet.getRange(`A${exceptionHeaderRow}:F${exceptionLastRow}`).format.font = {
    name: FONT_FAMILY,
    size: 10,
  };
  addTable(
    sheet,
    `A${exceptionHeaderRow}:F${exceptionLastRow}`,
    safeTableName("Exceptions", project.tab_name, projectIndex + 1),
  );
  styleHeader(sheet, `A${exceptionHeaderRow}:F${exceptionHeaderRow}`);
  sheet.getRange(`B${exceptionHeaderRow + 1}:B${exceptionLastRow}`).format.numberFormat = "mm/dd/yy";
  sheet.getRange(`D${exceptionHeaderRow + 1}:D${exceptionLastRow}`).format.numberFormat = "0.00";
  if (exceptionEntries.length > 0) {
    sheet
      .getRange(`A${exceptionHeaderRow + 1}:F${exceptionLastRow}`)
      .conditionalFormats.addCustom(
        `=OR($F${exceptionHeaderRow + 1}<>\"Coded\",$E${exceptionHeaderRow + 1}<>\"Complete\")`,
        {
        fill: COLORS.paleRed,
        font: { color: COLORS.red },
        },
      );
  }

  const usedRows = exceptionLastRow;
  setWidths(
    sheet,
    Array.from({ length: Math.max(matrixHeaders.length, 6) }, (_, index) =>
      index === 0 ? 24 : index === 2 && matrixHeaders.length <= 6 ? 34 : 15,
    ),
    usedRows,
  );
  sheet.getRange(`C${exceptionHeaderRow + 1}:C${exceptionLastRow}`).format.columnWidth = 44;
  sheet.getRange(`E${exceptionHeaderRow + 1}:F${exceptionLastRow}`).format.columnWidth = 28;
  sheet.freezePanes.freezeRows(matrixHeaderRow);
  sheet.freezePanes.freezeColumns(1);
  return { sheet, summary, usedRows, maxColumns: Math.max(matrixHeaders.length, 6) };
}

function buildRawEntriesSheet(workbook, dataset) {
  const sheet = workbook.worksheets.add("Raw Entries");
  sheet.showGridLines = false;
  const rows = dataset.projects
    .flatMap((project) => project.entries)
    .sort((left, right) =>
      `${left.project}|${left.person}|${left.start_ms ?? 0}|${left.time_entry_id}`.localeCompare(
        `${right.project}|${right.person}|${right.start_ms ?? 0}|${right.time_entry_id}`,
      ),
    );
  const headers = [
    "Project",
    "Person",
    "Person ID",
    "Work Date",
    "Start (local)",
    "End (local)",
    "Hours",
    "Duration Status",
    "Project Code",
    "Coding Status",
    "Task ID",
    "Task Name",
    "List",
    "Folder",
    "Space",
    "Time Entry ID",
    "Billable",
    "Description",
    "Tags",
    "Task URL",
  ];
  const values = rows.length > 0
    ? rows.map((entry) => [
        entry.project,
        entry.person,
        entry.person_id ? `U-${String(entry.person_id)}` : "",
        entry.work_date ? new Date(`${entry.work_date}T00:00:00`) : null,
        entry.start_ms !== null &&
        entry.start_ms !== undefined &&
        Number.isFinite(Number(entry.start_ms))
          ? new Date(Number(entry.start_ms))
          : null,
        entry.end_ms !== null &&
        entry.end_ms !== undefined &&
        Number.isFinite(Number(entry.end_ms))
          ? new Date(Number(entry.end_ms))
          : null,
        entry.hours !== null &&
        entry.hours !== undefined &&
        Number.isFinite(Number(entry.hours))
          ? Number(entry.hours)
          : null,
        entry.duration_status,
        entry.project_code,
        entry.coding_status,
        String(entry.task_id ?? ""),
        entry.task_name,
        entry.list_name,
        entry.folder_name,
        entry.space_name,
        entry.time_entry_id ? `TE-${String(entry.time_entry_id)}` : "",
        entry.billable,
        entry.description,
        entry.tags,
        entry.task_url,
      ])
    : [["No entries returned", ...Array(headers.length - 1).fill(null)]];

  sheet.getRange("A1").values = [["Raw ClickUp time entries"]];
  styleTitle(sheet, "A1");
  sheet.getRange("A2").values = [[
    `Source: ClickUp REST API v2. ${dataset.run.start_date} through ${dataset.run.end_date} (end exclusive), ${dataset.run.time_zone}.`,
  ]];
  sheet.getRange("A2").format.font = {
    name: FONT_FAMILY,
    size: 10,
    italic: true,
    color: COLORS.darkGray,
  };
  const headerRow = 4;
  const lastRow = headerRow + values.length;
  const lastColumn = excelColumn(headers.length - 1);
  sheet.getRange(`A${headerRow}:${lastColumn}${lastRow}`).write([headers, ...values]);
  sheet.getRange(`A${headerRow}:${lastColumn}${lastRow}`).format.font = {
    name: FONT_FAMILY,
    size: 10,
  };
  addTable(sheet, `A${headerRow}:${lastColumn}${lastRow}`, "RawEntriesTable");
  styleHeader(sheet, `A${headerRow}:${lastColumn}${headerRow}`);
  sheet.getRange(`D${headerRow + 1}:D${lastRow}`).format.numberFormat = "mm/dd/yy";
  sheet.getRange(`E${headerRow + 1}:F${lastRow}`).format.numberFormat = "mm/dd/yy h:mm AM/PM";
  sheet.getRange(`G${headerRow + 1}:G${lastRow}`).format.numberFormat = "0.00";
  sheet.getRange(`C${headerRow + 1}:C${lastRow}`).format.numberFormat = "@";
  sheet.getRange(`K${headerRow + 1}:K${lastRow}`).format.numberFormat = "@";
  sheet.getRange(`P${headerRow + 1}:P${lastRow}`).format.numberFormat = "@";
  const widths = [
    22, 22, 14, 12, 20, 20, 10, 24, 28, 34,
    16, 44, 28, 24, 24, 22, 12, 38, 28, 42,
  ];
  setWidths(sheet, widths, lastRow);
  sheet.freezePanes.freezeRows(headerRow);
  sheet.freezePanes.freezeColumns(2);
  return { sheet, usedRows: lastRow, maxColumns: headers.length, rows };
}

function buildRunInfoSheet(workbook, dataset, orderedProjects, projectResults, rawResult) {
  const sheet = workbook.worksheets.add("Run Info");
  sheet.showGridLines = false;
  sheet.tabColor = COLORS.gray;
  const allEntries = rawResult.rows;
  const totalHours = projectResults.reduce(
    (total, result) => total + result.summary.total_hours,
    0,
  );
  const metadata = [
    ["Source", dataset.run.source ?? "Normalized ClickUp extract"],
    ["Generated", dataset.run.generated_at_local ?? "Not recorded"],
    ["Start date", dataset.run.start_date],
    ["End date (exclusive)", dataset.run.end_date],
    ["Timezone", dataset.run.time_zone],
    ["Workspace", dataset.run.workspace_name ?? "Not recorded"],
    ["Project Code field", dataset.run.project_code_field ?? "Project Code"],
    ["Configured calls per minute", dataset.run.max_calls_per_minute ?? 0],
    ["Minimum request interval (ms)", dataset.run.minimum_request_interval_ms ?? 0],
    ["API call attempts", dataset.run.api_call_attempts ?? 0],
    ["Returned time entries", allEntries.length],
    ["Total valid hours", totalHours],
  ];
  sheet.getRange("A2").values = [["Timesheet run information"]];
  styleTitle(sheet, "A2");
  sheet.getRange("A4:B4").values = [["Run field", "Value"]];
  sheet.getRange(`A5:B${4 + metadata.length}`).values = metadata;
  sheet.getRange(`A4:B${4 + metadata.length}`).format.font = {
    name: FONT_FAMILY,
    size: 10,
  };
  styleHeader(sheet, "A4:B4");
  sheet.getRange(`B${4 + metadata.length}:B${4 + metadata.length}`).format.numberFormat = "0.00";

  const projectTitleRow = 6 + metadata.length;
  const projectHeaderRow = projectTitleRow + 1;
  const projectRows = orderedProjects.map((project, index) => [
    project.name,
    project.source?.space_name ?? "Not recorded",
    project.source?.list_count ?? 0,
    project.source?.task_count ?? 0,
    project.entries.length,
    projectResults[index].summary.total_hours,
    projectResults[index].summary.coverage ?? "n.a.",
    (project.source?.warnings ?? []).join(" "),
  ]);
  const projectLastRow = projectHeaderRow + projectRows.length;
  sheet.getRange(`A${projectTitleRow}`).values = [["Project coverage"]];
  styleSection(sheet, `A${projectTitleRow}:H${projectTitleRow}`);
  sheet.getRange(`A${projectHeaderRow}:H${projectLastRow}`).write([
    ["Project", "Space", "Lists", "Tasks", "Entries", "Hours", "Coding coverage", "Warnings"],
    ...projectRows,
  ]);
  sheet.getRange(`A${projectHeaderRow}:H${projectLastRow}`).format.font = {
    name: FONT_FAMILY,
    size: 10,
  };
  addTable(sheet, `A${projectHeaderRow}:H${projectLastRow}`, "ProjectCoverageTable");
  styleHeader(sheet, `A${projectHeaderRow}:H${projectHeaderRow}`);
  sheet.getRange(`F${projectHeaderRow + 1}:F${projectLastRow}`).format.numberFormat = "0.00";
  for (let row = projectHeaderRow + 1; row <= projectLastRow; row += 1) {
    if (typeof projectRows[row - projectHeaderRow - 1][6] === "number") {
      sheet.getRange(`G${row}`).format.numberFormat = "0.0%";
    }
  }

  const limitations = [
    "Project Code is read from the task's current custom-field value, not a historical custom-field snapshot.",
    "Archived, deleted, moved, or otherwise unavailable tasks remain uncoded; the generator does not issue per-entry task requests.",
    "Running or invalid-duration entries remain visible but are excluded from hour totals.",
    "The workbook supports invoice review but does not decide whether time is contractually billable.",
  ];
  const limitationTitleRow = projectLastRow + 3;
  sheet.getRange(`A${limitationTitleRow}`).values = [["Limitations"]];
  styleSection(sheet, `A${limitationTitleRow}:H${limitationTitleRow}`);
  sheet.getRange(`A${limitationTitleRow + 1}:A${limitationTitleRow + limitations.length}`).values =
    limitations.map((limitation) => [limitation]);

  const calls = Array.isArray(dataset.run.api_calls) ? dataset.run.api_calls : [];
  const callsTitleRow = limitationTitleRow + limitations.length + 3;
  const callsHeaderRow = callsTitleRow + 1;
  const callRows = calls.length > 0
    ? calls.map((call, index) => [
        index + 1,
        call.method,
        call.path,
        call.status,
        call.attempt,
        call.elapsed_ms,
      ])
    : [[0, "No live API calls", "", "", "", ""]];
  const callsLastRow = callsHeaderRow + callRows.length;
  sheet.getRange(`A${callsTitleRow}`).values = [["Sanitized API call log"]];
  styleSection(sheet, `A${callsTitleRow}:F${callsTitleRow}`);
  sheet.getRange(`A${callsHeaderRow}:F${callsLastRow}`).write([
    ["Call", "Method", "Path", "Status", "Attempt", "Elapsed ms"],
    ...callRows,
  ]);
  sheet.getRange(`A${callsHeaderRow}:F${callsLastRow}`).format.font = {
    name: FONT_FAMILY,
    size: 10,
  };
  addTable(sheet, `A${callsHeaderRow}:F${callsLastRow}`, "ApiCallLogTable");
  styleHeader(sheet, `A${callsHeaderRow}:F${callsHeaderRow}`);
  sheet.getRange(`A${callsHeaderRow + 1}:A${callsLastRow}`).format.numberFormat = "#,##0";
  sheet.getRange(`F${callsHeaderRow + 1}:F${callsLastRow}`).format.numberFormat = "#,##0";
  setWidths(sheet, [30, 32, 64, 14, 12, 14, 18, 54], callsLastRow);
  sheet.getRange(`A${limitationTitleRow + 1}:A${limitationTitleRow + limitations.length}`).format.columnWidth = 110;
  sheet.freezePanes.freezeRows(4);
  return { sheet, usedRows: callsLastRow, maxColumns: 8, totalHours };
}

async function buildWorkbook(dataset, outputPath, previewDirectory) {
  const workbook = Workbook.create();
  const orderedProjects = [
    ...REQUIRED_PROJECT_TABS.map((tabName) =>
      dataset.projects.find((project) => project.tab_name === tabName),
    ),
    ...dataset.projects.filter(
      (project) => !REQUIRED_PROJECT_TABS.includes(project.tab_name),
    ),
  ];
  const projectResults = orderedProjects.map((project, index) =>
    buildProjectSheet(workbook, dataset, project, index),
  );
  const rawResult = buildRawEntriesSheet(workbook, dataset);
  const runInfoResult = buildRunInfoSheet(
    workbook,
    dataset,
    orderedProjects,
    projectResults,
    rawResult,
  );

  const projectHours = projectResults.reduce(
    (total, result) => total + result.summary.total_hours,
    0,
  );
  const rawHours = sumHours(rawResult.rows);
  if (Math.abs(projectHours - rawHours) > 0.000001) {
    throw new Error(
      `Workbook reconciliation failed: project tabs total ${projectHours}, raw entries total ${rawHours}.`,
    );
  }

  workbook.recalculate();
  if (previewDirectory) {
    await fs.mkdir(previewDirectory, { recursive: true });
    for (const result of [...projectResults, rawResult, runInfoResult]) {
      const lastColumn = excelColumn(Math.min(result.maxColumns, 12) - 1);
      const lastRow = Math.min(result.usedRows, 45);
      const preview = await workbook.render({
        sheetName: result.sheet.name,
        range: `A1:${lastColumn}${lastRow}`,
        scale: 1,
        format: "png",
      });
      const safeName = result.sheet.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      await fs.writeFile(
        path.join(previewDirectory, `${safeName}.png`),
        new Uint8Array(await preview.arrayBuffer()),
      );
    }
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);
  return {
    output: outputPath,
    total_entries: rawResult.rows.length,
    total_hours: rawHours,
    api_call_attempts: Number(dataset.run.api_call_attempts ?? 0),
    max_calls_per_minute: Number(dataset.run.max_calls_per_minute ?? 0),
    projects: orderedProjects.map((project, index) => ({
      project: project.name,
      tab: project.tab_name,
      entries: project.entries.length,
      hours: projectResults[index].summary.total_hours,
      coding_coverage: projectResults[index].summary.coverage,
    })),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const outputPath = path.resolve(requiredArgument(args, "output"));
  let dataset;
  if (args.input_json) {
    dataset = validateDataset(await readJson(path.resolve(args.input_json)));
    const dataTimeZone = normalizeText(dataset.run?.time_zone) || "America/Chicago";
    validateTimeZone(dataTimeZone);
    process.env.TZ = dataTimeZone;
    dataset.run.time_zone = dataTimeZone;
  } else {
    const configPath = path.resolve(requiredArgument(args, "config"));
    args.start = requiredArgument(args, "start");
    args.end = requiredArgument(args, "end");
    args.time_zone = normalizeText(args.time_zone) || "America/Chicago";
    validateDateString(args.start, "start");
    validateDateString(args.end, "end");
    validateTimeZone(args.time_zone);
    process.env.TZ = args.time_zone;
    if (toLocalMidnightEpoch(args.end) <= toLocalMidnightEpoch(args.start)) {
      throw new Error("end must be later than start.");
    }
    const config = validateConfig(await readJson(configPath));
    dataset = validateDataset(await collectLiveDataset(args, config));
  }

  if (args.audit_json) {
    await writeJson(path.resolve(args.audit_json), dataset);
  }
  const summary = await buildWorkbook(
    dataset,
    outputPath,
    args.preview_dir ? path.resolve(args.preview_dir) : null,
  );
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(`Timesheet generation failed: ${error.message}`);
  process.exitCode = 1;
});
