import { EventEmitter } from 'node:events';
import { DocumentUri, Range, Position } from 'vscode-languageserver-types';
import { URI } from 'vscode-uri';
import * as _sinclair_typebox_compiler from '@sinclair/typebox/compiler';
import * as _sinclair_typebox from '@sinclair/typebox';
import { Static, TSchema } from '@sinclair/typebox';
import { TextDocument as TextDocument$1, TextDocumentContentChangeEvent } from 'vscode-languageserver-textdocument';
import * as vscode_languageserver from 'vscode-languageserver';
import {
  CancellationToken,
  MessageActionItem,
  NotificationType,
  NotificationHandler as NotificationHandler$1,
  WorkspaceFoldersChangeEvent,
  WorkspaceFolder as WorkspaceFolder$1,
  Features,
} from 'vscode-languageserver';
import { Readable } from 'node:stream';
import {
  ProtocolRequestType,
  InitializeParams,
  Connection,
  ClientCapabilities,
  CancellationToken as CancellationToken$1,
  Disposable,
  NotificationHandler,
} from 'vscode-languageserver/node.js';
import * as http from 'node:http';

type TokenEnvelope = {
  user_notification: boolean;
  token: string;
  error_details: Record<string, unknown>;
  expires_at: number;
  refresh_in: number;
  organization_list?: string[];
  enterprise_list?: string[];
  copilotignore_enabled?: boolean;
  copilot_ide_agent_chat_gpt4_small_prompt: boolean;
  endpoints?: {
    api: string;
    proxy: string;
    'origin-tracker': string;
    telemetry: string;
  };
  chat_enabled: boolean;
  codesearch: boolean;
};
type CopilotAuthStatus =
  | {
      kind: 'success';
      envelope: TokenEnvelope;
    }
  | {
      kind: 'failure';
      reason: string;
      message?: string;
      code?: number;
      msg?: string;
      meta?: {
        [key: string]: unknown;
      };
    };
type GitHubToken = {
  token: string;
  devOverride?: {
    copilotTokenUrl?: string;
    notificationUrl?: string;
    contentRestrictionsUrl?: string;
  };
};
type AuthRecord = {
  user: 'codespace-user' | string;
  oauth_token: string;
  githubAppId?: string;
  dev_override?: {
    copilot_token?: string;
    notification?: string;
    content_restrictions?: string;
  };
};
type AuthStatus =
  | {
      status: 'NotSignedIn';
      user?: AuthRecord['user'];
    }
  | {
      status: 'MaybeOK' | 'OK';
      user: AuthRecord['user'];
    }
  | {
      status: 'Other';
      user: AuthRecord['user'];
      reason: string;
    };

type ContextKey<T> = abstract new (...args: any[]) => T;
declare class Context {
  readonly instances: Map<ContextKey<any>, any>;
  get<T>(ctor: ContextKey<T>): T;
  tryGet<T>(ctor: ContextKey<T>): T | undefined;
  set<T>(ctor: ContextKey<T>, instance: T): void;
  forceSet<T>(ctor: ContextKey<T>, instance: T): void;
  assertIsInstance<T>(ctor: ContextKey<T>, instance: any): void;
}

interface IPersistenceManager {
  read(setting: string, key: string): Promise<unknown>;
  update(setting: string, key: string, value: unknown): Promise<void>;
  delete(setting: string, key: string): Promise<void>;
  deleteSetting(setting: string): Promise<void>;
  listSettings(): Promise<string[]>;
  listKeys(setting: string): Promise<string[]>;
}
declare class PersistenceManager implements IPersistenceManager {
  readonly directory: string;
  constructor(directory: string);
  read(setting: string, key: string): Promise<unknown>;
  update(setting: string, key: string, value: unknown): Promise<void>;
  delete(setting: string, key: string): Promise<void>;
  deleteSetting(setting: string): Promise<void>;
  listSettings(): Promise<string[]>;
  listKeys(setting: string): Promise<string[]>;
}

declare class AuthPersistence {
  readonly ctx: Context;
  readonly persistenceManager: PersistenceManager;
  constructor(ctx: Context, persistenceManager: PersistenceManager);
  getAuthRecord(): Promise<AuthRecord>;
  legacyAuthRecordMaybe(): Promise<unknown>;
  saveAuthRecord(authRecord: AuthRecord): Promise<void>;
  deleteAuthRecord(): Promise<void>;
  authRecordKey(ctx: Context): string;
  legacyAuthRecordKey(ctx: Context): string;
}

declare enum LogLevel {
  DEBUG = 4,
  INFO = 3,
  WARN = 2,
  ERROR = 1,
}
declare abstract class LogTarget {
  shouldLog(ctx: Context, level: LogLevel): boolean | undefined;
  abstract logIt(ctx: Context, level: LogLevel, metadataStr: string, ...extra: any[]): void;
}

declare class CopilotToken {
  readonly envelope: Partial<Omit<TokenEnvelope, 'token' | 'refresh_in' | 'expires_at'>> &
    Pick<TokenEnvelope, 'token' | 'refresh_in' | 'expires_at'>;
  readonly token: string;
  readonly organization_list: TokenEnvelope['organization_list'];
  readonly enterprise_list: TokenEnvelope['enterprise_list'];
  readonly tokenMap: Map<string, string>;
  constructor(
    envelope: Omit<Partial<TokenEnvelope>, 'token' | 'refresh_in' | 'expires_at'> &
      Pick<TokenEnvelope, 'token' | 'refresh_in' | 'expires_at'>
  );
  get expiresAt(): number;
  get refreshIn(): number;
  isExpired(): boolean;
  static testToken(envelope?: Partial<TokenEnvelope>): CopilotToken;
  private parseToken;
  getTokenValue(key: string): string | undefined;
}

declare abstract class CopilotTokenManager {
  readonly tokenRefreshEventEmitter: EventEmitter;
  getGitHubToken(ctx: Context): Promise<string | undefined>;
  abstract getGitHubSession(ctx: Context): Promise<GitHubToken | undefined>;
  abstract getCopilotToken(ctx: Context, force?: boolean): Promise<CopilotToken>;
  abstract resetCopilotToken(ctx: Context, httpError?: number): void;
  abstract checkCopilotToken(ctx: Context): Promise<
    | Extract<
        CopilotAuthStatus,
        {
          kind: 'failure';
        }
      >
    | {
        status: 'OK';
      }
  >;
}
declare abstract class CopilotTokenManagerFromGitHubTokenBase extends CopilotTokenManager {
  private copilotToken?;
  getCopilotToken(ctx: Context, force: boolean): Promise<CopilotToken>;
  checkCopilotToken(ctx: Context): Promise<
    | Extract<
        CopilotAuthStatus,
        {
          kind: 'failure';
        }
      >
    | {
        status: 'OK';
      }
  >;
  resetCopilotToken(ctx: Context, httpError?: number): void;
}
declare class CopilotTokenManagerFromAuthManager extends CopilotTokenManagerFromGitHubTokenBase {
  getGitHubSession(ctx: Context): Promise<GitHubToken | undefined>;
}

type DeviceFlow = {
  device_code: string;
  expires_in: number;
  interval: number;
  user_code: string;
  verification_uri: string;
};
declare class GitHubDeviceFlow {
  getToken(
    ctx: Context,
    clientId: string
  ): Promise<
    DeviceFlow & {
      waitForAuth: Promise<AuthRecord>;
    }
  >;
  getTokenUnguarded(
    ctx: Context,
    clientId: string
  ): Promise<
    DeviceFlow & {
      waitForAuth: Promise<AuthRecord>;
    }
  >;
}

declare class AuthManager {
  readonly authPersistence: AuthPersistence;
  private _copilotTokenManager;
  private _pendingSignIn?;
  private _transientAuthRecord?;
  constructor(authPersistence: AuthPersistence, copilotTokenManager: CopilotTokenManager);
  getCopilotTokenManager(): CopilotTokenManager;
  setPendingSignIn(promise: Promise<AuthStatus> | undefined): void;
  getPendingSignIn(): Promise<AuthStatus> | undefined;
  checkAndUpdateStatus(
    ctx: Context,
    options?: {
      localChecksOnly?: boolean;
      forceRefresh?: boolean;
    }
  ): Promise<AuthStatus>;
  getAuthRecord(): Promise<AuthRecord | undefined>;
  getPersistedAuthRecord(): Promise<AuthRecord>;
  getGitHubToken(ctx: Context): Promise<GitHubToken | undefined>;
  setAuthRecord(ctx: Context, authRecord: AuthRecord): Promise<void>;
  setTransientAuthRecord(ctx: Context, authRecord?: AuthRecord | null): Promise<void>;
  deleteAuthRecord(ctx: Context): Promise<void>;
}

type LanguageId$1 = string;
type Document = {
  languageId: LanguageId$1;
  relativePath?: string;
  source: string;
  offset?: number;
  uri: string;
};
interface IPromptOptions {
  maxPromptLength: number;
  numberOfSnippets: number;
  similarFiles: string;
  lineEnding: 'unix';
  tokenizerName: string;
  suffixPercent: number;
  suffixMatchThreshold: number;
  promptOrderListPreset: string;
  promptPriorityPreset: string;
  snippetTextProcessingPreset: string;
  cacheReferenceTokens: boolean;
}
type SnippetContext = {
  currentFile: Document;
  tooltipSignature?: string;
  similarFiles?: Document[];
  options?: IPromptOptions;
};
interface Element {
  id: number;
  kind: string;
  tokens: number;
  text: string;
  score: number;
}
interface Snippet {
  provider: string;
  semantics: 'snippet';
  snippet: string;
  startLine: number;
  endLine: number;
  relativePath?: Document['relativePath'];
  score: number;
}
type SnippetsResult = {
  snippets: Snippet[];
  providerType: string;
  runtime: number;
};
type SnippetsError = {
  error: unknown;
  providerType: 'string';
};
type PromptElementRanges = {
  ranges: {
    kind: Element['kind'];
    start: number;
    end: number;
  }[];
};
type Prompt = {
  prefix: string;
  suffix: string;
  prefixTokens: number;
  suffixTokens: number;
  isFimEnabled: boolean;
  promptElementRanges: PromptElementRanges['ranges'];
};

declare class FilterSettings {
  filters: Record<string, string>;
  constructor(filters: FilterHeaders);
  extends(otherFilterSettings: FilterSettings): boolean;
  addToTelemetry(telemetryData: TelemetryData): void;
  stringify(): string;
  toHeaders(): FilterHeaders;
  withChange(filter: string, value: string): FilterSettings;
}

declare enum ChatModelFamily {
  Gpt35turbo = 'gpt-3.5-turbo',
  Gpt4 = 'gpt-4',
  Gpt4turbo = 'gpt-4-turbo',
  Gpt4o = 'gpt-4o',
  Unknown = 'unknown',
}
declare abstract class ModelMetadataProvider {
  abstract getMetadata(): Promise<Model.Metadata[]>;
}

declare class ExpConfig {
  variables: Partial<{
    maxpromptcompletionTokens: number;
    idechatgpt4maxtokens: number;
    idechatgpt4maxrequesttokens: number;
    idechatexpmodelfamily: ChatModelFamily;
    idechatexpmodelid: string;
    idechatenableprojectmetadata: boolean;
    idechatmetapromptversion: string;
    idechatintentmodel: string;
    idechatintentthresholdpercent: number;
    idechatintenttokenizer: string;
    idechatenableprojectcontext: boolean;
    copilotdebouncems: number;
    copilotdebouncepredict: boolean;
    copilotcontextualfilterenable: boolean;
    copilotcontextualfilterenabletree: boolean;
    copilotcontextualfilteracceptthreshold: number;
    copilotcontextualfilterexplorationtraffic: number;
    copilotdisablelogprob: boolean;
    copilotoverrideblockmode: BlockMode;
    copilotoverridefastcancellation: boolean;
    copilotoverridednumghostcompletions: number;
    copilotdropcompletionreasons: string;
    copilotcustomengine: string;
    copilotlms: number;
    copilotlbeot: boolean;
    CopilotSuffixPercent: number;
    copilotsuffixmatchthreshold: number;
    copilotnumberofsnippets: number;
    copilotneighboringtabs: Lowercase<CopilotNeighboringTabs>;
    copilotcppheaders: boolean;
    copilotrelatedfiles: boolean;
    copilotcachereferencetokens: boolean;
    copilotpromptorderlistpreset: 'default';
    copilotpromptprioritypreset: 'office-exp';
    copilotbycallbuckets: number;
    copilottimeperiodsizeinh: number;
  }>;
  assignmentContext: string;
  features: string;
  constructor(
    variables: Partial<{
      maxpromptcompletionTokens: number;
      idechatgpt4maxtokens: number;
      idechatgpt4maxrequesttokens: number;
      idechatexpmodelfamily: ChatModelFamily;
      idechatexpmodelid: string;
      idechatenableprojectmetadata: boolean;
      idechatmetapromptversion: string;
      idechatintentmodel: string;
      idechatintentthresholdpercent: number;
      idechatintenttokenizer: string;
      idechatenableprojectcontext: boolean;
      copilotdebouncems: number;
      copilotdebouncepredict: boolean;
      copilotcontextualfilterenable: boolean;
      copilotcontextualfilterenabletree: boolean;
      copilotcontextualfilteracceptthreshold: number;
      copilotcontextualfilterexplorationtraffic: number;
      copilotdisablelogprob: boolean;
      copilotoverrideblockmode: BlockMode;
      copilotoverridefastcancellation: boolean;
      copilotoverridednumghostcompletions: number;
      copilotdropcompletionreasons: string;
      copilotcustomengine: string;
      copilotlms: number;
      copilotlbeot: boolean;
      CopilotSuffixPercent: number;
      copilotsuffixmatchthreshold: number;
      copilotnumberofsnippets: number;
      copilotneighboringtabs: Lowercase<CopilotNeighboringTabs>;
      copilotcppheaders: boolean;
      copilotrelatedfiles: boolean;
      copilotcachereferencetokens: boolean;
      copilotpromptorderlistpreset: 'default';
      copilotpromptprioritypreset: 'office-exp';
      copilotbycallbuckets: number;
      copilottimeperiodsizeinh: number;
    }>,
    assignmentContext: string,
    features: string
  );
  static createFallbackConfig(ctx: Context, reason: string): ExpConfig;
  static createEmptyConfig(): ExpConfig;
  addToTelemetry(telemetryData: TelemetryData): void;
}

type IncludeExp = 'SkipExp' | 'IncludeExp';
declare class TelemetryReporters {
  reporter?: IReporter;
  reporterRestricted?: IReporter;
  reporterFT?: IReporter;
  getReporter(ctx: Context, store?: TelemetryStore): IReporter | undefined;
  getRestrictedReporter(ctx: Context): IReporter | undefined;
  getFTReporter(ctx: Context): IReporter | undefined;
  setReporter(reporter: IReporter): void;
  setRestrictedReporter(reporter: IReporter): void;
  setFTReporter(reporter: IReporter): void;
  deactivate(): Promise<void>;
}
declare class TelemetryData {
  properties: TelemetryProperties;
  measurements: TelemetryMeasurements;
  issuedTime: number;
  static validateTelemetryProperties: _sinclair_typebox_compiler.TypeCheck<_sinclair_typebox.TObject<{}>>;
  static validateTelemetryMeasurements: _sinclair_typebox_compiler.TypeCheck<
    _sinclair_typebox.TObject<{
      meanLogProb: _sinclair_typebox.TOptional<_sinclair_typebox.TNumber>;
      meanAlternativeLogProb: _sinclair_typebox.TOptional<_sinclair_typebox.TNumber>;
    }>
  >;
  static keysExemptedFromSanitization: string[];
  static keysToRemoveFromStandardTelemetryHack: string[];
  displayedTime?: number;
  constructor(properties: TelemetryProperties, measurements: TelemetryMeasurements, issuedTime: number);
  static createAndMarkAsIssued(properties?: TelemetryProperties, measurements?: TelemetryMeasurements): TelemetryData;
  extendedBy(properties?: TelemetryProperties, measurements?: TelemetryMeasurements): TelemetryData;
  markAsDisplayed(): void;
  extendWithExpTelemetry(ctx: Context): Promise<void>;
  extendWithEditorAgnosticFields(ctx: Context): void;
  extendWithConfigProperties(ctx: Context): void;
  extendWithRequestId(requestId: OpenAIRequestId): void;
  static maybeRemoveRepoInfoFromPropertiesHack<T>(store: TelemetryStore, map: Record<string, T>): Record<string, T>;
  sanitizeKeys(): void;
  static sanitizeKeys<T>(map: Record<string, T>): Record<string, T>;
  updateMeasurements(): void;
  validateData(ctx: Context, store: TelemetryStore): boolean;
  makeReadyForSending(ctx: Context, store: TelemetryStore, includeExp: IncludeExp): Promise<void>;
}
declare class TelemetryWithExp extends TelemetryData {
  filtersAndExp: {
    filters: FilterSettings;
    exp: ExpConfig;
  };
  constructor(
    properties: TelemetryProperties,
    measurements: TelemetryMeasurements,
    issuedTime: number,
    filtersAndExp: {
      filters: FilterSettings;
      exp: ExpConfig;
    }
  );
  extendedBy(properties?: TelemetryProperties, measurements?: TelemetryMeasurements): TelemetryWithExp;
  extendWithExpTelemetry(ctx: Context): Promise<void>;
  static createEmptyConfigForTesting(): TelemetryWithExp;
}

declare class TextDocument {
  private _uri;
  private _textDocument;
  constructor(uri: URI | string, textDocument: TextDocument$1);
  static create(uri: URI | string, languageId: LanguageId, version: number, text: string): TextDocument;
  static wrap(textDocument: TextDocument$1): TextDocument;
  get lspTextDocument(): TextDocument$1;
  get uri(): DocumentUri;
  get vscodeUri(): URI;
  get languageId(): LanguageId;
  get version(): number;
  get lineCount(): number;
  getText(range?: Range): string;
  positionAt(offset: number): Position;
  offsetAt(position: Position): number;
  lineAt(positionOrLineNumber: number | Position): {
    text: string;
    range: Range;
    isEmptyOrWhitespace: boolean;
  };
  update(changes: TextDocumentContentChangeEvent[], version: number): void;
}

type ValidDocumentResult = {
  status: 'valid';
  document: TextDocument;
};
type DocumentValidationResult =
  | ValidDocumentResult
  | {
      status: 'invalid';
      reason: string;
    }
  | {
      status: 'notfound';
      message: string;
    };

type TextDocumentResultStatus = 'empty' | 'included' | 'blocked' | 'notfound';
declare class FileReader {
  readonly ctx: Context;
  constructor(ctx: Context);
  getRelativePath(doc: TextDocument): Promise<string>;
  readFile(uri: string): Promise<DocumentValidationResult>;
  readFromTextDocumentManager(uri: URI): Promise<DocumentValidationResult>;
  readFromFilesystem(uri: URI): Promise<DocumentValidationResult>;
  doReadFile(uri: URI): Promise<string>;
  getFileSizeMB(uri: URI): Promise<number>;
  fileExists(file: URI): Promise<boolean>;
}

declare class MergedToken implements CancellationToken {
  private tokens;
  private handlers;
  private _isCancelled;
  constructor(tokens: CancellationToken[]);
  cancel(): void;
  get isCancellationRequested(): boolean;
  onCancellationRequested(
    listener: (token?: CancellationToken) => void,
    thisArgs?: CancellationToken
  ): {
    dispose(): void;
  };
  dispose(): void;
}

declare const DocumentSchema: _sinclair_typebox.TObject<{
  uri: _sinclair_typebox.TString;
  position: _sinclair_typebox.TOptional<
    _sinclair_typebox.TObject<{
      line: _sinclair_typebox.TNumber;
      character: _sinclair_typebox.TNumber;
    }>
  >;
  visibleRange: _sinclair_typebox.TOptional<
    _sinclair_typebox.TObject<{
      start: _sinclair_typebox.TObject<{
        line: _sinclair_typebox.TNumber;
        character: _sinclair_typebox.TNumber;
      }>;
      end: _sinclair_typebox.TObject<{
        line: _sinclair_typebox.TNumber;
        character: _sinclair_typebox.TNumber;
      }>;
    }>
  >;
  selection: _sinclair_typebox.TOptional<
    _sinclair_typebox.TObject<{
      start: _sinclair_typebox.TObject<{
        line: _sinclair_typebox.TNumber;
        character: _sinclair_typebox.TNumber;
      }>;
      end: _sinclair_typebox.TObject<{
        line: _sinclair_typebox.TNumber;
        character: _sinclair_typebox.TNumber;
      }>;
    }>
  >;
  openedAt: _sinclair_typebox.TOptional<_sinclair_typebox.TString>;
  activeAt: _sinclair_typebox.TOptional<_sinclair_typebox.TString>;
}>;
declare const ReferenceSchema: _sinclair_typebox.TObject<{
  uri: _sinclair_typebox.TString;
  position: _sinclair_typebox.TOptional<
    _sinclair_typebox.TObject<{
      line: _sinclair_typebox.TNumber;
      character: _sinclair_typebox.TNumber;
    }>
  >;
  visibleRange: _sinclair_typebox.TOptional<
    _sinclair_typebox.TObject<{
      start: _sinclair_typebox.TObject<{
        line: _sinclair_typebox.TNumber;
        character: _sinclair_typebox.TNumber;
      }>;
      end: _sinclair_typebox.TObject<{
        line: _sinclair_typebox.TNumber;
        character: _sinclair_typebox.TNumber;
      }>;
    }>
  >;
  selection: _sinclair_typebox.TOptional<
    _sinclair_typebox.TObject<{
      start: _sinclair_typebox.TObject<{
        line: _sinclair_typebox.TNumber;
        character: _sinclair_typebox.TNumber;
      }>;
      end: _sinclair_typebox.TObject<{
        line: _sinclair_typebox.TNumber;
        character: _sinclair_typebox.TNumber;
      }>;
    }>
  >;
  openedAt: _sinclair_typebox.TOptional<_sinclair_typebox.TString>;
  activeAt: _sinclair_typebox.TOptional<_sinclair_typebox.TString>;
}>;
type Reference = Static<typeof ReferenceSchema>;

declare class Turn {
  request: {
    message: string;
    type: 'user' | 'template' | 'follow-up';
  };
  id: string;
  timestamp: number;
  status: 'success' | 'in-progress' | 'error' | 'cancelled' | 'filtered' | 'off-topic';
  skills: (Pick<Unknown.SkillResolution, 'skillId'> & Partial<Unknown.SkillResolution>)[];
  references: Reference[];
  annotations: Unknown.Annotation[];
  workspaceFolder?: string;
  agent?: {
    agentSlug: string;
  };
  template?: {
    templateId: string;
    userQuestion: string;
  };
  response?: {
    message: string;
    type: 'meta' | 'server' | 'model' | 'user' | 'offtopic-detection';
  };
  constructor(request: { message: string; type: 'user' | 'template' | 'follow-up' });
}
declare class Conversation {
  turns: Turn[];
  readonly source: 'panel' | 'inline';
  private _id;
  private _timestamp;
  constructor(turns?: Turn[], source?: 'panel' | 'inline');
  copy(): Conversation;
  get id(): string;
  get timestamp(): number;
  addTurn(turn: Turn): void;
  deleteTurn(turnId: string): void;
  getLastTurn(): Turn;
  hasTurn(turnId: string): boolean;
}

declare abstract class ConversationProgress {
  abstract begin(conversation: Conversation, turn: Turn, workDoneToken: Unknown.WorkDoneToken): Promise<void>;
  abstract cancel(conversation: Conversation, turn: Turn, error?: unknown): Promise<void>;
  abstract end(conversation: Conversation, turn: Turn, payload: unknown): Promise<void>;
  abstract report(
    conversation: Conversation,
    turn: Turn,
    payload: {
      reply?: string;
      annotations?: Unknown.Annotation[];
      steps?: unknown[];
      hideText?: boolean;
    }
  ): Promise<void>;
}

type Step = {
  id: SkillId;
  title: string;
  description?: string;
  status: Steps.Status;
  error?: {
    message: string;
  };
};
declare namespace Steps {
  type Status = 'completed' | 'cancelled' | 'running' | 'failed';
}
declare class Steps {
  readonly ctx: Context;
  readonly conversation: Conversation;
  readonly turn: Turn;
  readonly progress: ConversationProgress;
  readonly steps: Step[];
  constructor(ctx: Context, conversation: Conversation, turn: Turn, progress: ConversationProgress);
  start(id: SkillId, title: string, description?: string): Promise<void>;
  finish(id: SkillId): Promise<void>;
  cancel(id: SkillId): Promise<void>;
  finishAll(status?: Steps.Status): Promise<void>;
  error(id: string, message?: string): void;
  private updateStep;
}

interface ITokenizer {
  tokenize(text: string): number[];
  detokenize(tokens: number[]): string;
  tokenLength(text: string): number;
  tokenizeStrings(text: string): string[];
  takeLastTokens(text: string, n: number): string;
  takeFirstTokens(
    text: string,
    n: number
  ): {
    text: string;
    tokens: number[];
  };
  takeLastLinesTokens(text: string, n: number): string;
}

declare class LineWithValueAndCost {
  text: string;
  private _value;
  private _cost;
  constructor(text: string, _value: number, _cost?: number, validate?: string);
  get value(): number;
  get cost(): number;
  adjustValue(multiplier: number): LineWithValueAndCost;
  recost(coster?: (text: string) => number): LineWithValueAndCost;
  copy(): LineWithValueAndCost;
}

declare namespace ElidableText {
  type Chunk = string | ElidableText | Document | [string | ElidableText | Document, number];
}
declare class ElidableText {
  lines: LineWithValueAndCost[];
  constructor(chunks: ElidableText.Chunk[]);
  adjust(multiplier: number): void;
  recost(coster?: (x: string) => number): void;
  makePrompt(
    maxTokens: number,
    ellipsis?: string,
    indentEllipses?: boolean,
    strategy?: 'removeLeastBangForBuck' | 'removeLeastDesirable',
    tokenizer?: ITokenizer
  ): string;
}

declare const ProjectMetadataSkillId: 'project-metadata';
declare const ProjectMetadataSchema: _sinclair_typebox.TObject<{
  language: _sinclair_typebox.TObject<{
    id: _sinclair_typebox.TString;
    name: _sinclair_typebox.TString;
    version: _sinclair_typebox.TOptional<_sinclair_typebox.TString>;
  }>;
  libraries: _sinclair_typebox.TArray<
    _sinclair_typebox.TObject<{
      name: _sinclair_typebox.TString;
      version: _sinclair_typebox.TOptional<_sinclair_typebox.TString>;
    }>
  >;
  buildTools: _sinclair_typebox.TArray<
    _sinclair_typebox.TObject<{
      name: _sinclair_typebox.TString;
      version: _sinclair_typebox.TOptional<_sinclair_typebox.TString>;
    }>
  >;
}>;

declare const ProjectLabelsSkillId: 'project-labels';
declare const ProjectLabelsSchema: _sinclair_typebox.TObject<{
  labels: _sinclair_typebox.TArray<_sinclair_typebox.TString>;
}>;

declare const CurrentEditorSkillId: 'current-editor';

declare class ConversationSkillRegistry<T extends Record<keyof T & SkillId, any> = SkillMap> {
  private skills;
  registerSkill<K extends keyof T & SkillId>(skill: Skill.ISkill<K, T[K]>): void;
  getSkill<K extends keyof T & SkillId>(id: K): Skill.ISkill<K, T[K]> | undefined;
  getSkill(id: SkillId): Skill.ISkill<SkillId, unknown> | undefined;
  getDescriptors(): Skill.ISkillDescriptor[];
}

declare const RecentFilesSchema: _sinclair_typebox.TObject<{
  files: _sinclair_typebox.TArray<
    _sinclair_typebox.TObject<{
      uri: _sinclair_typebox.TString;
      position: _sinclair_typebox.TOptional<
        _sinclair_typebox.TObject<{
          line: _sinclair_typebox.TNumber;
          character: _sinclair_typebox.TNumber;
        }>
      >;
      visibleRange: _sinclair_typebox.TOptional<
        _sinclair_typebox.TObject<{
          start: _sinclair_typebox.TObject<{
            line: _sinclair_typebox.TNumber;
            character: _sinclair_typebox.TNumber;
          }>;
          end: _sinclair_typebox.TObject<{
            line: _sinclair_typebox.TNumber;
            character: _sinclair_typebox.TNumber;
          }>;
        }>
      >;
      selection: _sinclair_typebox.TOptional<
        _sinclair_typebox.TObject<{
          start: _sinclair_typebox.TObject<{
            line: _sinclair_typebox.TNumber;
            character: _sinclair_typebox.TNumber;
          }>;
          end: _sinclair_typebox.TObject<{
            line: _sinclair_typebox.TNumber;
            character: _sinclair_typebox.TNumber;
          }>;
        }>
      >;
      openedAt: _sinclair_typebox.TOptional<_sinclair_typebox.TString>;
      activeAt: _sinclair_typebox.TOptional<_sinclair_typebox.TString>;
    }>
  >;
}>;
declare const RecentFilesSkillId: 'recent-files';

declare const GitMetadataSchema: _sinclair_typebox.TObject<{
  path: _sinclair_typebox.TString;
  head: _sinclair_typebox.TOptional<
    _sinclair_typebox.TObject<{
      name: _sinclair_typebox.TString;
      upstream: _sinclair_typebox.TOptional<
        _sinclair_typebox.TObject<{
          name: _sinclair_typebox.TString;
          url: _sinclair_typebox.TString;
        }>
      >;
    }>
  >;
  remotes: _sinclair_typebox.TOptional<
    _sinclair_typebox.TArray<
      _sinclair_typebox.TObject<{
        name: _sinclair_typebox.TString;
        url: _sinclair_typebox.TString;
      }>
    >
  >;
}>;
declare const GitMetadataSkillId: 'git-metadata';

declare const ProblemsInActiveDocumentSchema: _sinclair_typebox.TObject<{
  uri: _sinclair_typebox.TString;
  problems: _sinclair_typebox.TArray<
    _sinclair_typebox.TObject<{
      message: _sinclair_typebox.TString;
      range: _sinclair_typebox.TObject<{
        start: _sinclair_typebox.TObject<{
          line: _sinclair_typebox.TNumber;
          character: _sinclair_typebox.TNumber;
        }>;
        end: _sinclair_typebox.TObject<{
          line: _sinclair_typebox.TNumber;
          character: _sinclair_typebox.TNumber;
        }>;
      }>;
    }>
  >;
}>;
declare const ProblemsInActiveDocumentSkillId: 'problems-in-active-document';

declare const RuntimeLogsSchema: _sinclair_typebox.TString;
declare const RuntimeLogsSkillId: 'runtime-logs';

declare const BuildLogsSchema: _sinclair_typebox.TString;
declare const BuildLogsSkillId: 'build-logs';

declare const TestContextSchema: _sinclair_typebox.TObject<{
  currentFileUri: _sinclair_typebox.TString;
  sourceFileUri: _sinclair_typebox.TOptional<_sinclair_typebox.TString>;
  testFileUri: _sinclair_typebox.TOptional<_sinclair_typebox.TString>;
}>;
declare const TestContextSkillId: 'test-context';

declare const TestFailuresSchema: _sinclair_typebox.TObject<{
  failures: _sinclair_typebox.TArray<
    _sinclair_typebox.TObject<{
      testName: _sinclair_typebox.TString;
      testSuite: _sinclair_typebox.TOptional<_sinclair_typebox.TString>;
      testFileUri: _sinclair_typebox.TString;
      failureReason: _sinclair_typebox.TOptional<_sinclair_typebox.TString>;
      testLocation: _sinclair_typebox.TObject<{
        start: _sinclair_typebox.TObject<{
          line: _sinclair_typebox.TNumber;
          character: _sinclair_typebox.TNumber;
        }>;
        end: _sinclair_typebox.TObject<{
          line: _sinclair_typebox.TNumber;
          character: _sinclair_typebox.TNumber;
        }>;
      }>;
    }>
  >;
}>;
declare const TestFailuresSkillId: 'test-failures';

type Request = {
  headers?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
} & (
  | {
      method?: 'GET';
    }
  | {
      method: 'POST';
      body: string | object;
      json?: never;
    }
  | {
      method: 'POST';
      body?: never;
      json: object;
    }
);
declare namespace Fetcher {
  type ProxySetting = {
    host: string;
    port: number;
    proxyAuth?: string;
    kerberosServicePrincipal?: string;
    ca?: readonly string[];
    connectionTimeoutInMs?: number;
  };
}
declare abstract class Fetcher {
  abstract readonly name: string;
  abstract proxySettings?: Fetcher.ProxySetting;
  abstract makeAbortController(): AbortController;
  abstract fetch(input: string, init?: Request): Promise<Response>;
  abstract disconnectAll(): Promise<void>;
  private _rejectUnauthorized?;
  set rejectUnauthorized(value: boolean | undefined);
  get rejectUnauthorized(): boolean | undefined;
}
declare class Response {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Pick<Headers, 'get'> & Iterable<[string, string]>;
  readonly getText: () => Promise<string>;
  readonly getBody: () => Promise<Readable>;
  readonly getJson?: (() => Promise<unknown>) | undefined;
  constructor(
    status: number,
    statusText: string,
    headers: Pick<Headers, 'get'> & Iterable<[string, string]>,
    getText: () => Promise<string>,
    getBody: () => Promise<Readable>,
    getJson?: (() => Promise<unknown>) | undefined
  );
  readonly ok: boolean;
  text(): Promise<string>;
  json(): Promise<unknown>;
  body(): Promise<Readable>;
}

declare const ProjectContextSnippetSchema: _sinclair_typebox.TObject<{
  path: _sinclair_typebox.TString;
  snippet: _sinclair_typebox.TString;
  range: _sinclair_typebox.TObject<{
    start: _sinclair_typebox.TObject<{
      line: _sinclair_typebox.TNumber;
      character: _sinclair_typebox.TNumber;
    }>;
    end: _sinclair_typebox.TObject<{
      line: _sinclair_typebox.TNumber;
      character: _sinclair_typebox.TNumber;
    }>;
  }>;
}>;
declare const ProjectContextSkillId: 'project-context';

declare const ReferencesSkillId: 'references';

type SkillMap = {
  [ProjectMetadataSkillId]: Static<typeof ProjectMetadataSchema>;
  [ProjectLabelsSkillId]: Static<typeof ProjectLabelsSchema>;
  [CurrentEditorSkillId]: Static<typeof DocumentSchema>;
  [RecentFilesSkillId]: Static<typeof RecentFilesSchema>;
  [GitMetadataSkillId]: Static<typeof GitMetadataSchema>;
  [ProblemsInActiveDocumentSkillId]: Static<typeof ProblemsInActiveDocumentSchema>;
  [RuntimeLogsSkillId]: Static<typeof RuntimeLogsSchema>;
  [BuildLogsSkillId]: Static<typeof BuildLogsSchema>;
  [TestContextSkillId]: Static<typeof TestContextSchema>;
  [TestFailuresSkillId]: Static<typeof TestFailuresSchema>;
  [ProjectContextSkillId]: Static<typeof ProjectContextSnippetSchema>[];
  [ReferencesSkillId]: Static<typeof ReferenceSchema>[];
};

type Collectible =
  | {
      type: 'file';
      skillId: string;
      uri: string;
      status: TextDocumentResultStatus;
      range?: Range;
    }
  | {
      type: 'label';
      skillId: string;
      label: string;
    };
declare class TurnContext {
  readonly ctx: Context;
  readonly conversation: Conversation;
  readonly turn: Turn;
  readonly cancelationToken: CancellationToken;
  readonly collector: Collector;
  readonly skillResolver: SkillResolver<SkillMap>;
  readonly steps: Steps;
  constructor(ctx: Context, conversation: Conversation, turn: Turn, cancelationToken: CancellationToken);
  collectFile(skillId: SkillId, uri: DocumentUri, status: TextDocumentResultStatus, range?: Range): void;
  collectLabel(skillId: string, label: string): void;
  isFileIncluded(uri: DocumentUri): boolean;
}
declare class SkillResolver<T extends Record<keyof T & SkillId, any> = SkillMap> {
  readonly turnContext: TurnContext;
  resolveStack: SkillId[];
  constructor(turnContext: TurnContext);
  resolve<K extends keyof T & SkillId>(skillId: K): Promise<T[K] | undefined>;
  resolve(skillId: SkillId): Promise<unknown | undefined>;
  ensureNoCycle(skillId: SkillId): void;
  newlyResolve<K extends keyof T & SkillId>(skillId: K): Promise<T[K] | undefined>;
}
declare class Collector {
  collectibles: Collectible[];
  collect(collectible: Collectible): void;
  collectiblesForSkill(skillId: string): Collectible[];
}

type ChatCompletion = {
  message: Chat.ChatMessage;
  choiceIndex: number;
  requestId: OpenAIRequestId;
  modelInfo?: Unknown.ModelInfo;
  blockFinished: boolean;
  finishReason: string;
  tokens: string[];
  numTokens: number;
  tool_calls: ToolCall[];
  telemetryData: TelemetryData;
};
declare enum ChatRole {
  System = 'system',
  User = 'user',
  Assistant = 'assistant',
  Function = 'function',
}

type LanguageId = string;
type SkillId = string;
type TurnId = string;
type FilterHeaderNames =
  | 'X-Copilot-Repository'
  | 'X-Copilot-FileType'
  | 'X-Copilot-UserKind'
  | 'X-Copilot-Dogfood'
  | 'X-Copilot-CustomModel'
  | 'X-Copilot-OverrideEngine'
  | 'X-VSCode-ExtensionName'
  | 'X-VSCode-ExtensionVersion'
  | 'X-VSCode-Build'
  | 'X-VSCode-AppVersion'
  | 'X-MSEdge-ClientId'
  | 'X-VSCode-TargetPopulation';
type FilterHeaders = Partial<Record<FilterHeaderNames, string>>;
type RepoUrlInfo = {
  hostname: string;
  owner: string;
  repo: string;
  pathname: string;
};
type RepoInfo = RepoUrlInfo & {
  baseFolder: string;
  url: string;
};
type CopilotNeighboringTabs =
  | 'none'
  | 'conservative'
  | 'medium'
  | 'eager'
  | 'eagerButLittle'
  | 'eagerButMedium'
  | 'eagerButMuch';
type TelemetryProperties = Record<string, string>;
type TelemetryRawProperties = Record<string, unknown>;
type TelemetryMeasurements = Record<string, number>;
declare enum TelemetryStore {
  OPEN = 0,
  RESTRICTED = 1,
}
type BlockMode = 'parsing' | 'parsingandserver' | 'server' | 'parsingandserver';
interface IReporter {
  sendTelemetryEvent(
    eventName: string,
    properties?: TelemetryRawProperties,
    measurements?: TelemetryMeasurements
  ): void;
  sendTelemetryErrorEvent(
    eventName: string,
    properties?: TelemetryProperties,
    measurements?: TelemetryMeasurements,
    errorProps?: unknown
  ): void;
  dispose(): Promise<void>;
}
type OpenAIRequestId = {
  headerRequestId: string;
  completionId: string;
  created: number;
  serverExperiments: string;
  deploymentId: string;
};
type Token = unknown;
type TextOffset = unknown;
type Logprob = unknown;
type TopLogprob = unknown;
type TokenLogprob = unknown;
type Tool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: TSchema;
  };
};
type ToolChoice = {
  type: Tool['type'];
  function: {
    name: Tool['function']['name'];
  };
};
type ToolCall = {
  type: 'function';
  function: {
    name: string;
    arguments: {
      context: Unknown.PromptContext;
      skillIds: SkillId[];
      suggestedTitle: string;
      followUp: string;
      keywords: {
        keyword: string;
        variations: string[];
      }[];
    };
  };
  approxNumTokens: number;
  skillIds?: SkillId[];
};
type AnnotationsMap = Record<string, Unknown.Annotation[]>;
type Choice = {
  delta?: {
    content: string;
    tool_calls: ({
      index: number;
    } & ToolCall)[];
    copilot_annotations: AnnotationsMap;
  };
  text: string;
  logprobs: Partial<{
    tokens: Token[];
    text_offset: TextOffset[];
    token_logprobs: TokenLogprob[];
    top_logprobs: TopLogprob[];
  }>;
  copilot_annotations: AnnotationsMap;
  completionText: string;
};
type DocumentEvaluateResult = {
  isBlocked: boolean;
  reason?: string;
  message?: string;
};
type UiKind =
  | 'ghostText'
  | 'synthesize'
  | 'conversationInline'
  | 'conversationPanel'
  | 'conversation'
  | 'conversationIntegrationTest';
type FetchResult =
  | {
      type: 'success';
      toolCalls: ToolCall[];
      numTokens: number;
      requestId: string;
    }
  | {
      type: 'offTopic';
    }
  | {
      type: 'canceled';
    }
  | {
      type: 'filtered';
    }
  | {
      type: 'length';
    }
  | {
      type: 'agentAuthRequired';
      authUrl: string;
    }
  | {
      type: 'successMultiple';
    }
  | {
      type: 'failed';
      reason: string;
      code: number;
    }
  | {
      type: 'failure';
      reason?: string;
    }
  | {
      type: 'successMultiple';
    }
  | {
      type: 'tool_calls';
    }
  | {
      type: 'unknown';
    };
declare namespace Chat {
  const Role: typeof ChatRole;
  type ChatMessage = {
    role: ChatRole;
    content: string;
    name?: string;
  };
  type ElidableChatMessage =
    | ChatMessage
    | {
        role: ChatRole;
        content: ElidableText;
        name?: string;
      };
}
type PromptType = 'user' | 'inline' | 'meta' | 'suggestions';
type WorkspaceFolder = URI;
declare enum CompletionResultType {
  New = 0,
  Cached = 1,
  UserTyping = 2,
  WithCompletion = 3,
}
type Completion$1 = {
  index: number;
  uuid: string;
  insertText: string;
  range: Range;
  file: URI;
  telemetry: TelemetryWithExp;
  displayText: string;
  position: Position;
  offset: number;
  resultType: CompletionResultType;
  triggerCategory: string;
};
declare namespace Model {
  type Metadata = {
    id: string;
    name: string;
    version: string;
    capabilities: {
      type: 'chat';
      family: ChatModelFamily;
    };
    isExperimental: boolean;
  };
  type TokenConfiguration = {
    maxTokens: number;
    maxRequestTokens: number;
    maxResponseTokens: number;
  };
  type Configuration = TokenConfiguration & {
    modelId: string;
    uiName?: string;
    modelFamily: ChatModelFamily;
    baseTokensPerMessage: number;
    baseTokensPerName: number;
    baseTokensPerCompletion: number;
    tokenizer: 'cl100k_base' | 'o200k_base' | 'cl100k_base';
    isExperimental: boolean;
  };
  type EmbeddingModelConfig = {
    modelId: string;
    modelFamily: string;
    maxBatchSize: number;
    maxTokens: number;
    tokenizer: string;
  };
}
declare namespace Skill {
  interface ISkillDescriptor {
    id: SkillId;
    type: 'implicit' | 'explicit';
    description(): string;
    examples?(): string[];
  }
  interface ISkill<K extends SkillId, T> extends ISkillDescriptor {
    id: K;
    resolver(turnContext: TurnContext): ISkillResolver<T>;
    processor(turnContext: TurnContext): ISkillProcessor<T>;
  }
  interface ISkillResolver<T extends unknown> {
    resolveSkill(turnContext: TurnContext): Promise<T | undefined>;
  }
  interface ITurnContextStep {
    start(stepId: string, stepTitle: string): Promise<void>;
    finish(stepId: string): Promise<void>;
    error(stepId: string, errorMessage: string): Promise<void>;
  }
  interface ISkillProcessor<T extends unknown> {
    processSkill(skill: T, turnContext: TurnContext): Promise<ElidableText | string | undefined>;
    value: () => number;
  }
}
declare namespace Unknown {
  type Annotation = {
    id: number;
    start_offset: number;
    stop_offset: number;
    type: 'code_vulnerability';
    details: {
      type: 'server-side-unvalidated-url-redirection';
      description: string;
      ui_type: 'test';
      ui_description: 'test';
    };
  };
  type ModelInfo = Extract<unknown, undefined>;
  type FinishReason = unknown;
  type ChatFetcher = {
    fetchResponse(params: any, token: Token): Promise<FetchResult>;
  };
  type Token = unknown;
  type SuggestionsFetchResult = {
    followUp: string;
    suggestedTitle: unknown;
    promptTokenLen: number;
    numTokens: number;
  };
  type FollowUp = {
    id: string;
    type: string;
  };
  type Suggestions = {
    followUp: FollowUp & {
      message: string;
    };
    suggestedTitle: SuggestionsFetchResult['suggestedTitle'];
  };
  type Agent = {
    id: string;
    slug: string;
    name: string;
  };
  type WorkDoneToken = string | number;
  type SkillResolution = {
    skillId: SkillId | 'unknown';
    resolution: 'resolved' | 'failed' | 'unprocessable' | 'unresolvable';
    files?: {
      status: unknown;
      uri: string;
    }[];
    tokensPreEliding?: number;
    resolutionTimeMs?: number;
    processingTimeMs?: number;
    labels: string[];
  };
  interface ToolConfig {
    skillIds?: SkillId[];
    extractArguments(toolCall: ToolCall): {
      skillIds?: SkillId[];
      followUp?: string;
      suggestedTitle?: string;
    };
    tool_choice: ToolChoice;
    tools: Tool[];
  }
  type ConversationPrompt = {
    messages: Chat.ElidableChatMessage[];
    tokens: number;
    skillResolutions: SkillResolution[];
    toolConfig?: ToolConfig;
  };
  type PromptContext = {
    skillIds: SkillId[];
  };
}

declare enum ConfigKey {
  Enable = 'enable',
  InlineSuggestEnable = 'inlineSuggest.enable',
  ShowEditorCompletions = 'editor.showEditorCompletions',
  EnableAutoCompletions = 'editor.enableAutoCompletions',
  DelayCompletions = 'editor.delayCompletions',
  FilterCompletions = 'editor.filterCompletions',
  FetchStrategy = 'fetchStrategy',
  DebugOverrideCppHeaders = 'advanced.debug.overrideCppHeaders',
  DebugOverrideRelatedFiles = 'advanced.debug.overrideRelatedFiles',
  DebugOverrideCapiUrl = 'advanced.debug.overrideCapiUrl',
  DebugTestOverrideCapiUrl = 'advanced.debug.testOverrideCapiUrl',
  DebugOverrideProxyUrl = 'advanced.debug.overrideProxyUrl',
  DebugTestOverrideProxyUrl = 'advanced.debug.testOverrideProxyUrl',
  DebugOverrideEngine = 'advanced.debug.overrideEngine',
  DebugOverrideLogLevels = 'advanced.debug.overrideLogLevels',
  DebugFilterLogCategories = 'advanced.debug.filterLogCategories',
  DebugSnippyOverrideUrl = 'advanced.debug.codeRefOverrideUrl',
  DebugUseElectronFetcher = 'advanced.debug.useElectronFetcher',
  DebugUseEditorFetcher = 'advanced.debug.useEditorFetcher',
}
type DefaultConvigValueType = {
  [ConfigKey.DebugOverrideCppHeaders]: boolean;
  [ConfigKey.DebugOverrideRelatedFiles]: boolean;
  [ConfigKey.DebugUseEditorFetcher]: 'true' | 'false' | null;
  [ConfigKey.DebugUseElectronFetcher]: unknown | null;
  [ConfigKey.DebugOverrideLogLevels]: Partial<{
    '*': LogLevel;
    [key: string]: LogLevel;
  }>;
  [ConfigKey.DebugSnippyOverrideUrl]: string;
  [ConfigKey.FetchStrategy]: 'auto' | 'client' | 'native';
  [ConfigKey.ShowEditorCompletions]: boolean | undefined;
  [ConfigKey.DelayCompletions]: boolean | undefined;
  [ConfigKey.FilterCompletions]: boolean | undefined;
};
type AdditionalConfigValueType = {
  [ConfigKey.Enable]: {
    '*': boolean;
    plaintext: boolean;
    markdown: boolean;
    scminput: boolean;
  };
  [ConfigKey.InlineSuggestEnable]: boolean;
  [ConfigKey.EnableAutoCompletions]: boolean;
  [ConfigKey.DebugOverrideCapiUrl]: string;
  [ConfigKey.DebugTestOverrideCapiUrl]: string;
  [ConfigKey.DebugOverrideProxyUrl]: string;
  [ConfigKey.DebugTestOverrideProxyUrl]: string;
  [ConfigKey.DebugOverrideEngine]: string;
  [ConfigKey.DebugFilterLogCategories]: string[];
};
type ConfigValueType = DefaultConvigValueType & AdditionalConfigValueType;
declare abstract class BlockModeConfig {
  abstract forLanguage(ctx: Context, languageId: LanguageId$1, telemetryData: TelemetryWithExp): Promise<BlockMode>;
}
declare abstract class ConfigProvider {
  abstract getConfig<K extends ConfigKey>(key: K): ConfigValueType[K];
  abstract getOptionalConfig<K extends ConfigKey>(key: K): ConfigValueType[K] | undefined;
  abstract dumpForTelemetry(): TelemetryProperties;
  abstract getLanguageConfig(key: ConfigKey, language?: LanguageId$1): unknown;
}
declare class DefaultsOnlyConfigProvider extends ConfigProvider {
  getConfig<K extends ConfigKey>(key: K): ConfigValueType[K];
  getOptionalConfig<K extends ConfigKey>(key: K): ConfigValueType[K] | undefined;
  dumpForTelemetry(): TelemetryProperties;
  getLanguageConfig(key: ConfigKey, language?: LanguageId$1): unknown;
}
declare class InMemoryConfigProvider extends ConfigProvider {
  protected baseConfigProvider: DefaultsOnlyConfigProvider;
  protected overrides: Partial<ConfigValueType>;
  private emitters;
  constructor(baseConfigProvider: DefaultsOnlyConfigProvider, overrides: Partial<ConfigValueType>);
  getOptionalOverride<K extends ConfigKey>(key: K): Partial<ConfigValueType>[K];
  getConfig<K extends ConfigKey>(key: K): ConfigValueType[K];
  getOptionalConfig<K extends ConfigKey>(key: K): ConfigValueType[K] | undefined;
  setConfig<K extends ConfigKey>(key: K, value?: ConfigValueType[K]): void;
  onConfigChange<K extends ConfigKey>(key: K, listener: (value: ConfigValueType[K]) => void): void;
  dumpForTelemetry(): TelemetryProperties;
  getLanguageConfig(key: ConfigKey, languageId?: LanguageId$1): unknown;
}
declare class BuildInfo {
  isProduction(): boolean;
  getBuildType(): string;
  getVersion(): string;
  getDisplayVersion(): string;
  getBuild(): string;
  getName(): string;
}
declare class EditorSession {
  readonly sessionId: string;
  readonly machineId: string;
  readonly remoteName: string;
  readonly uiKind: string;
  constructor(sessionId: string, machineId: string, remoteName?: string, uiKind?: string);
}
declare namespace EditorAndPluginInfo {
  type EditorInfo = {
    name: 'unknown-editor' | string;
    readableName?: string;
    version: string;
    devName?: string;
    root?: string;
  };
  type EditorPluginInfo = {
    name: string;
    version: string;
    readableName?: string;
  };
}
declare abstract class EditorAndPluginInfo {
  abstract getEditorPluginInfo(): EditorAndPluginInfo.EditorPluginInfo;
  abstract getEditorInfo(): EditorAndPluginInfo.EditorInfo;
  abstract setEditorAndPluginInfo(
    editorInfo: EditorAndPluginInfo.EditorInfo,
    editorPluginInfo: EditorAndPluginInfo.EditorPluginInfo
  ): void;
}
declare class GitHubAppInfo {
  githubAppId?: string;
  findAppIdToAuthenticate(): string;
  fallbackAppId(): string;
}

declare class AgentClientCopilotTokenManager extends CopilotTokenManager {
  static RequestType: ProtocolRequestType<
    {
      force: boolean;
    },
    {
      envelope: TokenEnvelope;
      accessToken: string;
      handle: string;
      githubAppId: string;
    },
    unknown,
    unknown,
    unknown
  >;
  private copilotToken?;
  private didChangeToken?;
  createCopilotEnvelope(ctx: Context, envelope: TokenEnvelope): CopilotToken;
  setCopilotEnvelope(ctx: Context, envelope: TokenEnvelope): void;
  getCopilotToken(ctx: Context, force?: boolean): Promise<CopilotToken>;
  checkCopilotToken(ctx: Context): Promise<{
    status: 'OK';
  }>;
  resetCopilotToken(ctx: Context, httpError?: number): void;
  getGitHubSession(ctx: Context): Promise<GitHubToken | undefined>;
}
declare class AgentCopilotTokenManager extends CopilotTokenManager {
  readonly fallback: CopilotTokenManagerFromAuthManager;
  readonly client: AgentClientCopilotTokenManager;
  constructor(fallback?: CopilotTokenManagerFromAuthManager);
  canGetToken(ctx: Context): boolean;
  getDelegate(ctx: Context): CopilotTokenManager;
  resetCopilotToken(ctx: Context, httpError?: number): void;
  getCopilotToken(ctx: Context, force?: boolean): Promise<CopilotToken>;
  checkCopilotToken(ctx: Context): Promise<
    | {
        kind: 'failure';
        reason: string;
        message?: string;
        code?: number;
        msg?: string;
        meta?: {
          [key: string]: unknown;
        };
      }
    | {
        status: 'OK';
      }
  >;
  getGitHubSession(ctx: Context): Promise<GitHubToken | undefined>;
  setCopilotEnvelope(ctx: Context, envelope: TokenEnvelope): void;
}

declare class AgentConfigProvider extends InMemoryConfigProvider {
  readonly env: NodeJS.ProcessEnv;
  constructor(env: NodeJS.ProcessEnv);
  private _set;
  setOverridesFromEnvironment(): void;
}

declare class LRUCacheMap<K, V> {
  private valueMap;
  private lruKeys;
  private sizeLimit;
  constructor(size?: number);
  set(key: K, value: V): LRUCacheMap<K, V>;
  get(key: K): V | undefined;
  delete(key: K): boolean;
  clear(): void;
  get size(): number;
  keys(): IterableIterator<K>;
  values(): IterableIterator<V>;
  entries(): IterableIterator<[K, V]>;
  [Symbol.iterator](): IterableIterator<[K, V]>;
  has(key: K): boolean;
  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void;
  get [Symbol.toStringTag](): string;
  peek(key: K): V | undefined;
  private removeKeyFromLRU;
  private touchKeyInLRU;
}

declare class CopilotCompletionCache extends LRUCacheMap<string, Completion$1> {
  constructor(maxSize?: number);
}

declare const CopilotCapabilitiesParam: _sinclair_typebox.TObject<{
  fetch: _sinclair_typebox.TOptional<_sinclair_typebox.TBoolean>;
  redirectedTelemetry: _sinclair_typebox.TOptional<_sinclair_typebox.TBoolean>;
  token: _sinclair_typebox.TOptional<_sinclair_typebox.TBoolean>;
  related: _sinclair_typebox.TOptional<_sinclair_typebox.TBoolean>;
  watchedFiles: _sinclair_typebox.TOptional<_sinclair_typebox.TBoolean>;
}>;
type CopilotCapabilitiesParamType = Static<typeof CopilotCapabilitiesParam>;
declare class CopilotCapabilitiesProvider {
  private capabilities;
  setCapabilities(capabilities: CopilotCapabilitiesParamType): void;
  getCapabilities(): CopilotCapabilitiesParamType;
}

declare namespace InitializedNotifier {
  type InitializeParams = InitializeParams & {
    copilotCapabilities: {
      fetch: boolean;
    };
  };
}
declare class InitializedNotifier {
  private emitter;
  private initialized;
  constructor();
  once(listener: (options: InitializedNotifier.InitializeParams) => void): void;
  emit(options: InitializedNotifier.InitializeParams): void;
}

type ValidationError = {
  code: number;
  message: string;
};
type HandlerFunction<T extends TSchema = TSchema, R = unknown, P extends Static<T> = unknown> = (
  ctx: Context,
  token: CancellationToken,
  params: P
) => Promise<['OK' | R, null] | [null, ValidationError]>;

type MethodName = string;
type HandlerFunctionType = HandlerFunction<TSchema, unknown, unknown>;
declare class MethodHandlers {
  readonly handlers: Map<MethodName, HandlerFunctionType>;
  constructor(handlers: Map<MethodName, HandlerFunctionType>);
}

type DocumentInfo = {
  uri: string;
};
type Entry = {
  type: string;
  uris: string[];
};
declare abstract class RelatedFilesProvider {
  readonly context: Context;
  constructor(context: Context);
  abstract getRelatedFileResponse(
    docInfo: DocumentInfo,
    wksFolder: unknown,
    telemetryData: TelemetryData
  ): Promise<{
    entries: Entry[];
  }>;
  getRelatedFiles(
    docInfo: DocumentInfo,
    wksFolder: unknown,
    telemetryData: TelemetryData
  ): Promise<Map<string, Map<string, string>> | null>;
  getFileContent(uri: URI): Promise<string | undefined>;
  isContentExcluded(uri: URI, content: string): Promise<boolean>;
  static dropBOM(content: string): string;
}

type WorkspaceWatcherFileEvent = {
  type: 'create' | 'update' | 'delete';
  files: URI[];
  workspaceFolder: URI;
};
type WorkspaceWatcherEventListener = (event: WorkspaceWatcherFileEvent) => void;
declare abstract class WorkspaceWatcher {
  readonly ctx: Context;
  readonly workspaceFolder: URI;
  abstract startWatching(): void;
  abstract stopWatching(): void;
  abstract getWatchedFiles(): Promise<URI[]>;
  private emitter;
  status: 'created' | 'stopped' | 'ready';
  constructor(ctx: Context, workspaceFolder: URI);
  onFileChange(listener: WorkspaceWatcherEventListener): void;
  onFilesCreated(files: URI[]): void;
  onFilesUpdated(files: URI[]): void;
  onFilesDeleted(files: URI[]): void;
  private emitEvent;
}

declare abstract class WorkspaceWatcherProvider {
  readonly ctx: Context;
  abstract createWatcher(workspaceFolder: URI): WorkspaceWatcher;
  abstract shouldStartWatching(folder: URI): boolean;
  private watchers;
  constructor(ctx: Context);
  getWatcher(workspaceFolder: URI): WorkspaceWatcher | undefined;
  hasWatcher(workspaceFolder: URI): boolean;
  startWatching(workspaceFolder: URI): void;
  stopWatching(workspaceFolder: URI): void;
  terminateWatching(workspaceFolder: URI): Promise<void>;
  onFileChange(workspaceFolder: URI, listener: WorkspaceWatcherEventListener): void;
  getWatchedFiles(workspaceFolder: URI): Promise<URI[]>;
  getStatus(workspaceFolder: URI): 'created' | 'stopped' | 'ready' | undefined;
}

type Info = {
  uri: URI;
  isRestricted: boolean;
  isUnknownFileExtension: boolean;
};
type WatchedFilesResponse = {
  watchedFiles: URI[];
  contentRestrictedFiles: URI[];
  unknownFileExtensions: URI[];
};
type GetWatchedFilesParams = {
  workspaceUri: string;
  excludeGitignoredFiles: boolean;
  excludeIDEIgnoredFiles: boolean;
};
declare namespace LspFileWatcher {
  type ChangeWatchedFilesEvent = {
    workspaceFolder: URI;
    created: Info[];
    changed: Info[];
    deleted: Info[];
  };
}
declare class LspFileWatcher {
  readonly ctx: Context;
  static readonly requestType: ProtocolRequestType<
    GetWatchedFilesParams,
    {
      files: string[];
    },
    unknown,
    unknown,
    unknown
  >;
  private emitter;
  constructor(ctx: Context);
  get connection(): Connection;
  init(): void;
  getWatchedFiles(params: GetWatchedFilesParams): Promise<WatchedFilesResponse>;
  onDidChangeWatchedFiles(listener: (event: LspFileWatcher.ChangeWatchedFilesEvent) => void): void;
  offDidChangeWatchedFiles(listener: (event: LspFileWatcher.ChangeWatchedFilesEvent) => void): void;
  didChangeWatchedFilesHandler(event: any): Promise<void>;
  isValid(uri: URI): Promise<boolean>;
}

declare class Service {
  readonly ctx: Context;
  readonly connection: Connection;
  private initialized;
  private _shutdown?;
  private _clientCapabilities?;
  private _originalLogTarget?;
  constructor(ctx: Context, connection: Connection);
  get clientCapabilities(): ClientCapabilities | undefined;
  listen(): void;
  messageHandler(method: string, params: unknown, token: CancellationToken$1): Promise<any>;
  onExit(): Promise<void>;
  dispose(): void;
}

declare abstract class NotificationSender {
  showWarningMessageOnlyOnce<T extends MessageActionItem>(message: string, ...actions: T[]): Promise<T | undefined>;
  abstract showWarningMessage<T extends MessageActionItem>(message: string, ...actions: T[]): Promise<T | undefined>;
}

declare abstract class UrlOpener {
  abstract open(target: string): Promise<void>;
}

declare abstract class StatusReporter {
  abstract setWarning(message?: string): void;
  abstract setError(message: string): void;
  abstract setInactive(message?: string): void;
  abstract forceNormal(): void;
  abstract setProgress(): void;
  abstract removeProgress(): void;
}

type FeatureFlagsNotification = {
  rt: boolean;
  sn: boolean;
  chat: boolean;
};
declare class FeatureFlagsNotifier {
  readonly ctx: Context;
  notificationType: NotificationType<FeatureFlagsNotification>;
  constructor(ctx: Context);
  private sendNotification;
}

type NotebookCell = {
  index: number;
  document: TextDocument;
};
interface INotebook {
  getCellFor(doc: TextDocument): NotebookCell;
  getCells(): NotebookCell[];
}
declare namespace TextDocumentManager {
  type DidFocusTextDocumentParams = {
    document: {
      uri: URI;
    };
  };
  type DidChangeTextDocumentParams = {
    document: TextDocument;
    contentChanges: {
      range: Range;
      rangeOffset: number;
      rangeLength: number;
      text: string;
    }[];
  };
  type EventListerner<E, T = any> = (this: T, event: E) => void;
  type EventListernerRegister<E, T = any> = (
    listener: EventListerner<E, T>,
    thisArgs: T,
    disposables?: boolean
  ) => Disposable;
}
declare abstract class TextDocumentManager {
  readonly ctx: Context;
  abstract getOpenTextDocuments(): TextDocument[];
  abstract getWorkspaceFolders(): WorkspaceFolder[];
  abstract onDidFocusTextDocument(
    handler: NotificationHandler<TextDocumentManager.DidFocusTextDocumentParams>
  ): Disposable;
  abstract onDidChangeTextDocument(
    handler: NotificationHandler<TextDocumentManager.DidChangeTextDocumentParams>
  ): Disposable;
  abstract findNotebook(doc: TextDocument): INotebook | void;
  constructor(ctx: Context);
  textDocuments(): Promise<TextDocument[]>;
  getTextDocument(uri: URI): Promise<TextDocument | undefined>;
  validateTextDocument(document: TextDocument, uri: URI): Promise<DocumentValidationResult>;
  getTextDocumentWithValidation(uri: URI): Promise<DocumentValidationResult>;
  getOpenTextDocumentWithValidation(uri: URI): Promise<DocumentValidationResult>;
  notFoundResult(uri: URI): Promise<DocumentValidationResult>;
  openTextDocument(uri: URI): Promise<TextDocument | undefined>;
  getWorkspaceFolder(doc: TextDocument): Promise<WorkspaceFolder | undefined>;
  getRelativePath(doc: TextDocument): Promise<string>;
}

declare class AgentTextDocumentManager extends TextDocumentManager {
  readonly workspaceFolders: WorkspaceFolder[];
  private _textDocumentConfiguration;
  private _textDocumentListener;
  constructor(ctx: Context);
  onDidChangeTextDocument(listener: NotificationHandler$1<TextDocumentManager.DidChangeTextDocumentParams>): {
    dispose: () => void;
  };
  onDidFocusTextDocument(listener: NotificationHandler$1<TextDocumentManager.DidFocusTextDocumentParams>): {
    dispose: () => void;
  };
  onDidChangeCursor(listener: NotificationHandler$1<unknown>): {
    dispose: () => void;
  };
  get connection(): vscode_languageserver.Connection;
  init(workspaceFolders: WorkspaceFolder[]): void;
  didChangeWorkspaceFolders(event: WorkspaceFoldersChangeEvent): void;
  unregisterWorkspaceFolder(container: WorkspaceFolder$1): void;
  registerWorkspaceFolder(container: WorkspaceFolder$1): void;
  getOpenTextDocuments(): TextDocument[];
  openTextDocument(uri: URI): Promise<TextDocument | undefined>;
  getWorkspaceFolders(): WorkspaceFolder[];
  findNotebook(doc: TextDocument): INotebook | void;
}

declare abstract class NetworkConfiguration {
  abstract getTokenUrl(githubToken: GitHubToken): string;
  abstract getCAPIUrl(ctx: Context, path?: string): string;
  abstract getCompletionsUrl(ctx: Context, path: string): string;
  abstract getTelemetryUrl(): string;
  abstract getNotificationUrl(githubToken: GitHubToken): string;
  abstract getLoginReachabilityUrl(): string;
  abstract getAPIReachabilityUrl(): string;
  abstract getAuthAuthority(): string;
  abstract getEmbeddingsUrl(ctx: Context): string;
  abstract getBlackbirdIndexingStatusUrl(): string;
  abstract getBlackbirdCodeSearchUrl(ctx: Context): string;
  abstract getBlackbirdDocsSearchUrl(ctx: Context): string;
  abstract getDeviceFlowStartUrl(): string;
  abstract getDeviceFlowCompletionUrl(): string;
  abstract getUserInfoUrl(): string;
  abstract getOriginTrackingUrl(ctx: Context, path: string): string;
  abstract getContentRestrictionsUrl(session: GitHubToken): string;
  abstract updateBaseUrl(ctx: Context, authUrl?: string): void;
}

declare class CopilotContentExclusionManager {
  private ctx;
  private _featureEnabled;
  private _contentExclusions;
  private _evaluateResultCache;
  constructor(ctx: Context);
  onDidChangeActiveTextEditor(e: TextDocumentManager.DidFocusTextDocumentParams): Promise<void>;
  get enabled(): boolean;
  evaluate(uri: URI, fileContent: string, shouldUpdateStatusBar?: 'UPDATE'): Promise<DocumentEvaluateResult>;
  updateStatusIcon(isBlocked: boolean, reason?: string): void;
  private _trackEvaluationResult;
}

declare class WorkDoneProgressTokens {
  private tokens;
  constructor();
  add(workDoneProgressToken: string | number, cancellationToken: CancellationToken): MergedToken;
  cancel(workDoneProgressToken: CancellationToken): void;
}

declare class Clock {
  now(): Date;
}

type APIChoice = {
  completionText: string;
  meanLogProb?: number;
  meanAlternativeLogProb?: number;
  choiceIndex: number;
  requestId: OpenAIRequestId;
  modelInfo?: Unknown.ModelInfo;
  blockFinished: boolean;
  tokens: string[];
  numTokens: number;
  telemetryData: TelemetryWithExp;
};

type CacheEntry$1 = {
  multiline: boolean;
  choices: APIChoice[];
};
declare class CompletionsCache {
  private _cache;
  constructor();
  get(promptKey: string): CacheEntry$1 | undefined;
  set(promptKey: string, contents: CacheEntry$1): void;
  clear(): void;
}

declare class CopilotTokenNotifier extends EventEmitter<{
  onCopilotToken: [CopilotToken];
}> {
  constructor();
}

declare abstract class RootCertificateReader {
  abstract getAllRootCAs(): Promise<readonly string[]>;
}

declare abstract class ProxySocketFactory {
  abstract createSocket(requestOptions: http.RequestOptions, proxySettings: Fetcher.ProxySetting): Promise<unknown>;
}

declare class Language {
  languageId: LanguageId;
  isGuess: boolean;
  fileExtension: string;
  constructor(languageId: LanguageId, isGuess: boolean, fileExtension: string);
}
declare abstract class LanguageDetection {
  abstract detectLanguage(doc: TextDocument): Language;
}

type PostInsertionEvent = {
  ctx: Context;
  insertionCategory: string;
  insertionOffset: number;
  fileURI: URI;
  completionText: string;
  telemetryData: TelemetryWithExp;
  completionId: string;
  start: Position;
};
declare class PostInsertionNotifier extends EventEmitter<{
  onPostInsertion: [PostInsertionEvent];
}> {}

declare class ExceptionRateLimiter {
  perMinute: number;
  cache: LRUCacheMap<string, number[]>;
  constructor(perMinute?: number);
  isThrottled(key: string): boolean;
}

declare class TelemetryUserConfig {
  readonly ctx: Context;
  trackingId?: string | undefined;
  optedIn: boolean;
  ftFlag: string;
  organizationsList?: string;
  enterpriseList?: string;
  sku?: string;
  constructor(ctx: Context, trackingId?: string | undefined, optedIn?: boolean, ftFlag?: string);
  setupUpdateOnToken(ctx: Context): void;
}

declare class TelemetryInitialization {
  private _args?;
  get isInitialized(): boolean;
  initialize(ctx: Context, telemetryNamespace: string, telemetryEnabled: boolean): Promise<void>;
  reInitialize(ctx: Context): Promise<void>;
}

interface IHeaderContributor {
  contributeHeaderValues(url: string, headers: Record<string, string>): void;
}
declare class HeaderContributors {
  private contributors;
  add(contributor: IHeaderContributor): void;
  remove(contributor: IHeaderContributor): void;
  contributeHeaders(url: string, headers: Record<string, string>): void;
  size(): number;
}

declare class UserErrorNotifier {
  private notifiedErrorCodes;
  notifyUser(ctx: Context, error: unknown): Promise<void>;
  private displayCertificateErrorNotification;
  private showCertificateWarningMessage;
  private didNotifyBefore;
}

declare class ContextualFilterManager {
  previousLabel: number;
  previousLabelTimestamp: number;
  probabilityAccept: number;
}

interface IStreamingToolCall {
  name?: string;
  arguments: ToolCall['function']['arguments'][];
}
interface IStreamingData {
  tool_calls: IStreamingToolCall[];
  text: string[];
  logprobs: Logprob[][];
  top_logprobs: TopLogprob[][];
  text_offset: TextOffset[][];
  tokens: Token[][];
}
type Completion = {
  solution: IStreamingData;
  finishOffset?: number;
  index: number;
  reason: string;
  requestId: OpenAIRequestId;
};
declare class APIJsonDataStreaming implements IStreamingData {
  logprobs: Logprob[][];
  top_logprobs: TopLogprob[][];
  text: string[];
  tokens: Token[][];
  text_offset: TextOffset[][];
  copilot_annotations: StreamCopilotAnnotations;
  tool_calls: StreamingToolCall[];
  append(choice: Choice): void;
}
declare class StreamingToolCall implements IStreamingToolCall {
  name?: string;
  arguments: ToolCall['function']['arguments'][];
  update(toolCall: ToolCall): void;
}
declare class StreamCopilotAnnotations {
  private current;
  update(annotations: AnnotationsMap): void;
  private update_namespace;
  for(namespaceKey: string): Unknown.Annotation[];
}
declare namespace SSEProcessor {
  type FinishedCb = (text: string, annotations?: StreamCopilotAnnotations) => Promise<Completion['finishOffset']>;
}
declare class SSEProcessor {
  readonly ctx: Context;
  expectedNumChoices: number;
  response: Response;
  body: Readable;
  telemetryData: TelemetryData;
  dropCompletionReasons: string[];
  fastCancellation?: boolean | undefined;
  cancellationToken?: CancellationToken | undefined;
  requestId: OpenAIRequestId;
  stats: ChunkStats;
  solutions: Record<string, APIJsonDataStreaming | null>;
  constructor(
    ctx: Context,
    expectedNumChoices: number,
    response: Response,
    body: Readable,
    telemetryData: TelemetryData,
    dropCompletionReasons: string[],
    fastCancellation?: boolean | undefined,
    cancellationToken?: CancellationToken | undefined
  );
  static create(
    ctx: Context,
    expectedNumChoices: number,
    response: Response,
    telemetryData: TelemetryWithExp,
    dropCompletionReasons?: string[],
    cancellationToken?: CancellationToken
  ): Promise<SSEProcessor>;
  processSSE(finishedCb?: SSEProcessor.FinishedCb): AsyncGenerator<Completion>;
  processSSEInner(
    finishedCb: (text: string, annotations?: StreamCopilotAnnotations) => Promise<Completion['finishOffset']>
  ): AsyncGenerator<Completion>;
  finishSolutions(): AsyncGenerator<Completion>;
  maybeCancel(description: string): boolean;
  cancel(): void;
  allSolutionsDone(): boolean;
}
declare class ChunkStats {
  choices: Map<number, ChoiceStats>;
  constructor(expectedNumChoices: number);
  add(choiceIndex: number): void;
  markYielded(choiceIndex: number): void;
  toString(): string;
}
declare class ChoiceStats {
  yieldedTokens: number;
  seenTokens: number;
  increment(): void;
  markYielded(): void;
}

declare namespace OpenAIFetcher {
  type ToolChoice = {
    type: 'function';
    function: {
      name: string;
    };
  };
  type ConversationRequest = {
    messages: Chat.ElidableChatMessage[];
    tools?: Tool[];
    tool_choice?: ToolChoice | 'auto';
    model: string;
    max_tokens: number;
    temperature: number;
    top_p: number;
    n: number;
    stop: string[];
    intent?: unknown;
    intent_model?: unknown;
    intent_tokenizer?: unknown;
    intent_threshold?: unknown;
    intent_content?: unknown;
    nwo: string;
    stream: boolean;
    logit_bias: Record<number, number>;
  };
  type ConversationParams = Pick<
    ConversationRequest,
    | 'messages'
    | 'tool_choice'
    | 'model'
    | 'tools'
    | 'intent'
    | 'intent_model'
    | 'intent_tokenizer'
    | 'intent_threshold'
    | 'intent_content'
  > & {
    endpoint: string;
    engineUrl: string;
    count: ConversationRequest['n'];
    postOptions?: Partial<ConversationRequest>;
    repoInfo?: RepoInfo;
    ourRequestId: string;
    authToken: string;
    uiKind: UiKind;
  };
  type ConversationResponse =
    | {
        type: 'success';
        chatCompletions: AsyncIterable<ChatCompletion>;
        getProcessingTime: () => number;
      }
    | {
        type: 'failed';
        reason: string;
        code: number;
      }
    | {
        type: 'canceled';
        reason: string;
      }
    | {
        type: 'authRequired';
        reason: string;
        authUrl: string;
      };
  type CompletionRequest = {
    prompt: string;
    suffix: string;
    max_tokens: number;
    temperature: number;
    top_p: number;
    n: number;
    stop: string[];
    logprobs: number;
    nwo: string;
    stream: boolean;
    extra: Partial<{
      language: string;
      next_indent: number;
      trim_by_indentation: boolean;
      prompt_tokens: number;
      suffix_tokens: number;
      force_indent: number;
    }>;
    logit_bias: {
      [key: number]: number;
    };
  };
  type CompletionParams = {
    prompt: Prompt;
    engineUrl: string;
    ourRequestId: string;
    count: number;
    languageId: string;
    requestLogProbs?: boolean;
    postOptions?: Partial<CompletionRequest>;
    headers?: Record<string, string>;
    uiKind: UiKind;
    repoInfo?: RepoInfo | 0;
  };
  type CompletionResponse =
    | {
        type: 'success';
        choices: AsyncIterable<APIChoice>;
        getProcessingTime: () => number;
      }
    | {
        type: 'failed';
        reason: string;
      }
    | {
        type: 'canceled';
        reason: string;
      };
}
declare abstract class OpenAIFetcher {
  abstract fetchAndStreamCompletions(
    ctx: Context,
    completionParams: OpenAIFetcher.CompletionParams,
    baseTelemetryData: TelemetryData,
    finishedCb: SSEProcessor.FinishedCb,
    cancellationToken: CancellationToken
  ): Promise<OpenAIFetcher.CompletionResponse>;
}

declare abstract class ExpConfigMaker {
  abstract fetchExperiments(ctx: Context, filterHeaders: FilterHeaders): Promise<ExpConfig>;
}

declare class PromiseQueue {
  protected promises: Set<Promise<unknown>>;
  constructor();
  register(promise: Promise<unknown>): Promise<void>;
  flush(): Promise<void>;
}

type Selection = {
  snippetLength: number;
  threshold: number;
  numberOfSnippets: number;
};
declare function getSimilarSnippets(
  doc: Document,
  similarFiles: Document[],
  options: keyof typeof similarFileOptionToSelection,
  cacheReferenceTokens: boolean
): Promise<Snippet[]>;
declare const similarFileOptionToSelection: Record<string, Selection>;

declare function sleep(delay: number): Promise<string>;
type Methods = Readonly<{
  sleep: typeof sleep;
  getSimilarSnippets: typeof getSimilarSnippets;
}>;
declare class WorkerProxy {
  private nextHandlerId;
  private pendingPromises;
  private port?;
  private worker?;
  private proxyEnabled;
  api: Methods;
  constructor();
  private initWorker;
  startThreading(): void;
  stopThreading(): void;
  proxyFunctions(): void;
  unproxyFunctions(): void;
  private configureWorkerResponse;
  private handleMessage;
  private handleError;
  proxy<K extends keyof Methods>(
    methods: Methods,
    fn: K
  ): (...args: Parameters<Methods[K]>) => Promise<Awaited<ReturnType<Methods[K]>>>;
}

declare abstract class SnippetProvider {
  protected api: Methods;
  abstract type: string;
  constructor(workerProxy: WorkerProxy);
  getSnippets(context: SnippetContext, signal: AbortSignal): Promise<SnippetsResult>;
  abstract buildSnippets(context: SnippetContext): Promise<Snippet[]>;
}

type ResolvedResult = {
  status: 'fulfilled';
  value: SnippetsResult;
};
type RejectedResult = {
  status: 'rejected';
  reason: SnippetsError;
};
declare class SnippetOrchestrator {
  private providers;
  constructor(providers?: (new (workerProxy: WorkerProxy) => SnippetProvider)[]);
  startThreading(): void;
  stopThreading(): void;
  getSnippets(context: SnippetContext): Promise<(ResolvedResult | RejectedResult)[]>;
}

declare class LastGhostText {
  private _position?;
  private _uri?;
  private _shownCompletions;
  partiallyAcceptedLength: number;
  index?: number;
  get position(): Position | undefined;
  get shownCompletions(): Completion$1[];
  get uri(): URI | undefined;
  resetState(): void;
  setState(uri: URI, position: Position): void;
  resetPartialAcceptanceState(): void;
}

declare class ForceMultiLine {
  requestMultilineOverride: boolean;
  constructor(requestMultilineOverride?: boolean);
}

type FileStat = {
  ctime: number;
  mtime: number;
  size: number;
  type: number;
};
declare abstract class FileSystem$1 {
  abstract readFileString(uri: URI): Promise<string>;
  abstract stat(uri: URI): Promise<FileStat>;
}

declare class GitRemoteUrl {
  private url;
  private _scheme?;
  private _authority?;
  private _hostname?;
  private _path?;
  private _error?;
  constructor(url: string);
  get scheme(): string | undefined;
  get authority(): string | undefined;
  get hostname(): string | undefined;
  get path(): string | undefined;
  isInvalid(): boolean;
  isRemote(): boolean;
  isGitHub(): boolean;
  isADO(): boolean;
  getUrlForApi(): string | null;
  isUrl(): boolean;
  parseUrl(): void;
  setAuthority(authority: string): void;
  tryParseSSHString(): boolean;
  setPath(path: string): void;
}

declare class GitRemoteResolver {
  resolveRemote(
    ctx: Context,
    baseFolder: {
      fsPath: string;
    }
  ): Promise<GitRemoteUrl | undefined>;
  private getRemotes;
  private applyInsteadOfRules;
  private getInsteadOfRules;
}

declare class GitRepository {
  readonly baseFolder: URI;
  readonly remote: GitRemoteUrl;
  private _tenant?;
  private _owner?;
  private _name?;
  private _adoOrganization?;
  constructor(baseFolder: URI, remote: GitRemoteUrl);
  get tenant(): string | undefined;
  get owner(): string | undefined;
  get name(): string | undefined;
  get adoOrganization(): string | undefined;
  isGitHub(): boolean;
  isADO(): boolean;
  setNWO(): void;
}
declare class RepositoryManager {
  readonly ctx: Context;
  readonly remoteResolver: GitRemoteResolver;
  readonly cache: LRUCacheMap<string, GitRepository | undefined>;
  constructor(ctx: Context);
  getRepo(uri: URI): Promise<GitRepository | undefined>;
  updateCache(paths: string[], repo?: GitRepository): void;
  tryGetRepoForFolder(uri: URI): Promise<GitRepository | undefined>;
  isBaseRepoFolder(uri: URI): Promise<boolean>;
  repoUrl(baseFolder: URI): Promise<GitRemoteUrl | undefined>;
  static getRepoConfigLocation(ctx: Context, baseFolder: URI): Promise<URI | undefined>;
  static getConfigLocationForGitfile(fs: FileSystem$1, baseFolder: URI, gitFile: URI): Promise<URI | undefined>;
  static tryStat(fs: FileSystem$1, path: URI): Promise<FileStat | undefined>;
}

declare class GitConfigData {
  private data;
  getKeys(): string[];
  getEntries(): [string, string[]][];
  get(key: string): string | undefined;
  getAll(key: string): string[] | undefined;
  add(key: string, value: string): void;
  getSectionValues(base: string, withKey: string): string[];
  concat(other: GitConfigData): GitConfigData;
  normalizeKey(key: string): string;
}
declare abstract class GitConfigLoader {
  abstract getConfig(
    ctx: Context,
    baseFolder: {
      fsPath: string;
    }
  ): Promise<GitConfigData | undefined>;
}

type WorkspaceFoldersChangeUriEvent = {
  added: URI[];
  removed: URI[];
};
declare class WorkspaceNotifier {
  private emitter;
  constructor();
  onChange(listener: (event: WorkspaceFoldersChangeUriEvent) => void): void;
  emit(event: WorkspaceFoldersChangeUriEvent): void;
}

declare class AvailableModelManager {
  getModels(ctx: Context): Promise<AvailableModels>;
  logModelsForToken(ctx: Context, token: CopilotToken): void;
}
declare class AvailableModels {
  readonly token: CopilotToken;
  constructor(token: CopilotToken);
  getModelIds(): string[];
  getModelForResource(ctx: Context, uri: URI, featureSettings?: TelemetryWithExp): Promise<ModelRequestInfo>;
}
declare class ModelRequestInfo {
  readonly modelId: string;
  readonly forceBaseModel: boolean;
  constructor(modelId: string, forceBaseModel?: boolean);
  get path(): string;
  get headers(): Record<string, string>;
}

declare class RuntimeMode {
  flags: Flags;
  constructor(flags: Flags);
  static fromEnvironment(isRunningInTest: boolean, argv?: string[], env?: Record<string, string>): RuntimeMode;
}
interface Flags {
  debug: boolean;
  verboseLogging: boolean;
  testMode: boolean;
  simulation: boolean;
}

type Capabilities = {
  skills: SkillId[];
  allSkills?: boolean;
};
declare class ConversationHolder {
  readonly conversation: Conversation;
  readonly capabilities: Capabilities;
  constructor(conversation: Conversation, capabilities: Capabilities);
}
declare class Conversations {
  readonly ctx: Context;
  private conversations;
  constructor(ctx: Context);
  create(capabilities: Capabilities, source?: 'inline' | 'panel'): Promise<Conversation>;
  destroy(conversationId: string): void;
  addTurn(conversationId: string, turn: Turn, references?: Reference[], workspaceFolder?: string): Promise<Turn>;
  determineAndApplyAgent(conversation: Conversation, turn: Turn): Promise<void>;
  determineAndApplyTemplate(conversation: Conversation, turn: Turn): Promise<void>;
  extractKeywordAndQuestionFromRequest(request: string, keywordIndicator: string): [string, string];
  deleteTurn(conversationId: string, turnId: string): void;
  get(id: string): Conversation;
  getCapabilities(id: SkillId): Capabilities;
  getSupportedSkills(id: SkillId): string[];
  filterSupportedSkills(id: SkillId, skillIds: SkillId[]): SkillId[];
  getHolder(id: string): ConversationHolder;
  getAll(): Conversation[];
  findByTurnId(turnId: string): Conversation | undefined;
}

declare class SkillDump<T extends Record<keyof T & SkillId, any>> {
  resolvedSkills: Partial<T>;
  resolutions: Unknown.SkillResolution[];
}
declare class ConversationDumper<T extends Record<keyof T & SkillId, any> = SkillMap> {
  dump: LRUCacheMap<string, SkillDump<T>>;
  promptsDump: LRUCacheMap<string, Map<PromptType, string>>;
  addResolvedSkill<K extends keyof T & SkillId>(turnId: TurnId, skillId: K, resolvedSkill: T[K]): void;
  getResolvedSkill<K extends keyof T & SkillId>(turnId: TurnId, skillId: K): T[K] | undefined;
  addResolution(turnId: TurnId, resolution: Unknown.SkillResolution): void;
  getDump(turnId: TurnId): SkillDump<T>;
  addPrompt(turnId: TurnId, prompt: string, promptType: PromptType): void;
  getLastTurnPrompts(): Map<PromptType, string> | undefined;
}

type SkillPromptOptions =
  | {
      promptType: 'user';
      languageId?: LanguageId;
    }
  | {
      promptType: 'inline';
      languageId?: LanguageId;
    }
  | {
      promptType: 'suggestions';
      languageId?: LanguageId;
    };
type MetaPromptOptions = {
  promptType: 'meta';
  supportedSkillDescriptors: Skill.ISkillDescriptor[];
};
type PromptOptions = SkillPromptOptions | MetaPromptOptions;
interface IPromptStrategy {
  promptContent(
    turnContext: TurnContext,
    safetyPrompt: string,
    promptOptions: PromptOptions
  ): Promise<[Chat.ElidableChatMessage[], Unknown.SkillResolution[]]>;
  toolConfig?(options: PromptOptions): Unknown.ToolConfig;
}

declare class PromptStrategyDescriptor {
  promptType: PromptType;
  modelFamilies: ChatModelFamily[];
  strategy: (ctx: Context) => Promise<IPromptStrategy>;
  constructor(
    promptType: PromptType,
    modelFamilies: ChatModelFamily[],
    strategy: (ctx: Context) => Promise<IPromptStrategy>
  );
}
declare class DefaultPromptStrategyFactory {
  createPromptStrategy(ctx: Context, promptType: PromptType, modelFamily: ChatModelFamily): Promise<IPromptStrategy>;
  get descriptors(): PromptStrategyDescriptor[];
}

declare class ConversationPromptEngine {
  readonly ctx: Context;
  readonly promptStrategyFactory: DefaultPromptStrategyFactory;
  constructor(ctx: Context, promptStrategyFactory?: DefaultPromptStrategyFactory);
  toPrompt(turnContext: TurnContext, options: PromptOptions): Promise<Unknown.ConversationPrompt>;
  elideChatMessages(
    elidableChatMessages: Chat.ElidableChatMessage[],
    modelConfiguration: Model.Configuration
  ): Promise<[Chat.ElidableChatMessage[], number]>;
  computeNonElidableTokens(
    elidableChatMessages: Chat.ElidableChatMessage[],
    modelConfiguration: Model.Configuration
  ): number;
  safetyPrompt(modelName?: string): Promise<string>;
}

declare abstract class ModelConfigurationProvider {
  abstract getBestChatModelConfig(modelFamilies: ChatModelFamily[]): Promise<Model.Configuration>;
  abstract getFirstMatchingEmbeddingModelConfiguration(
    modelFamily: string
  ): Promise<Model.EmbeddingModelConfig | undefined>;
}

declare class SyntheticTurn {
  readonly workDoneToken: Unknown.WorkDoneToken;
  readonly chunks: string[];
  readonly followUp: string;
  readonly suggestedTitle: string;
  readonly skills: SkillId[];
  readonly references: Reference[];
  constructor(
    workDoneToken: Unknown.WorkDoneToken,
    chunks: string[],
    followUp?: string,
    suggestedTitle?: string,
    skills?: SkillId[],
    references?: Reference[]
  );
}
declare class SyntheticTurns {
  private turns;
  add(
    workDoneToken: Unknown.WorkDoneToken,
    chunks: string[],
    followUp?: string,
    suggestedTitle?: string,
    skills?: SkillId[],
    references?: Reference[]
  ): void;
  get(workDoneToken: Unknown.WorkDoneToken): SyntheticTurn | undefined;
}

type URLToCheck = {
  label: string;
  url: string;
  severity: 'critical' | 'not-critical';
};
type URLReachability = URLToCheck & {
  message: string;
  status: string;
};

type PreconditionResult = {
  type: string;
  status: 'ok' | 'failed';
  details?: URLReachability[];
};
type PreconditionsResultEvent = {
  status: PreconditionResult['status'];
  results: PreconditionResult[];
};
declare class ReachabilityPreconditionCheck {
  check(ctx: Context): Promise<PreconditionResult>;
}
declare class TokenPreconditionCheck {
  check(ctx: Context): Promise<PreconditionResult>;
}
declare class ChatEnabledPreconditionCheck {
  check(ctx: Context): Promise<PreconditionResult>;
}
declare class PreconditionsCheck {
  readonly ctx: Context;
  readonly checks: (ReachabilityPreconditionCheck | TokenPreconditionCheck | ChatEnabledPreconditionCheck)[];
  readonly emitter: EventEmitter<{
    onPreconditionsChanged: [PreconditionsResultEvent];
  }>;
  private result?;
  constructor(
    ctx: Context,
    checks?: (ReachabilityPreconditionCheck | TokenPreconditionCheck | ChatEnabledPreconditionCheck)[]
  );
  check(forceCheck?: boolean): Promise<{
    results: PreconditionResult[];
    status: 'ok' | 'failed';
  }>;
  onChange(listener: (result: PreconditionsResultEvent) => void): void;
  emit(result: PreconditionsResultEvent): void;
}

declare class PreconditionsNotifier {
  readonly ctx: Context;
  readonly notificationType: NotificationType<PreconditionsResultEvent>;
  constructor(ctx: Context);
  private sendNotification;
}

declare class CapiVersionHeaderContributor {
  readonly ctx: Context;
  constructor(ctx: Context);
  contributeHeaderValues(url: string, headers: Record<string, string>): void;
  isBlackbirdEndpoint(endpoint: string): boolean;
}

interface ITurnProcessor {
  process(
    workDoneToken: Unknown.WorkDoneToken,
    cancelationToken: CancellationToken,
    followUp?: Unknown.FollowUp,
    doc?: TextDocument
  ): Promise<void>;
}
declare class TurnProcessorFactory {
  createProcessor(
    turnContext: TurnContext,
    workDoneToken: Unknown.WorkDoneToken,
    computeSuggestions?: boolean
  ): Promise<ITurnProcessor>;
}

type CacheEntry = {
  status: boolean;
  timestamp: number;
};
declare class BlackbirdIndexingStatus {
  private _cache;
  queryIndexingStatus(turnContext: TurnContext, repoNwo: string, githubToken: string): Promise<boolean>;
  isValid(cacheEntry: CacheEntry | undefined): cacheEntry is CacheEntry;
  isRepoIndexed(
    turnContext: TurnContext,
    repoInfo: RepoInfo,
    githubToken: string,
    forceCheck?: boolean
  ): Promise<boolean>;
  get cache(): LRUCacheMap<string, CacheEntry>;
}

declare class OpenAIChatMLFetcher {
  fetchAndStreamChat(
    ctx: Context,
    params: OpenAIFetcher.ConversationParams,
    baseTelemetryData: TelemetryData,
    finishedCb: SSEProcessor.FinishedCb,
    cancel?: CancellationToken
  ): Promise<OpenAIFetcher.ConversationResponse>;
  createTelemetryData(endpoint: string, ctx: Context, params: OpenAIFetcher.ConversationParams): TelemetryData;
  fetchWithParameters(
    ctx: Context,
    endpoint: string,
    params: OpenAIFetcher.ConversationParams,
    cancel: CancellationToken | undefined,
    telemetryProperties: TelemetryProperties,
    telemetryMeasurements: TelemetryMeasurements
  ): Promise<'not-sent' | Response | undefined>;
  handleError(
    ctx: Context,
    statusReporter: StatusReporter,
    telemetryData: TelemetryData,
    response: Response
  ): Promise<OpenAIFetcher.ConversationResponse>;
}

declare namespace ChatMLFetcher {
  type SuccessfulResponse =
    | {
        type: 'success';
        value: string;
        toolCalls: ToolCall[];
        requestId: string;
        numTokens: number;
      }
    | {
        type: 'tool_calls';
        toolCalls: ToolCall[];
        requestId: string;
      }
    | {
        type: 'filtered';
        reason: string;
        requestId: string;
      }
    | {
        type: 'length';
        reason: string;
        requestId: string;
      }
    | {
        type: 'successMultiple';
        value: string[];
        toolCalls: ToolCall[][];
        requestId: string;
      }
    | {
        type: 'unknown';
        reason: string;
        requestId: string;
      };
  type CanceledResponse = {
    type: 'canceled';
    reason: string;
    requestId: string;
  };
  type FailedResponse =
    | {
        type: 'offTopic';
        reason: string;
        requestId: string;
      }
    | {
        type: 'failed';
        reason: string;
        requestId: string;
        code?: number;
      };
  type AuthRequiredResponse = {
    type: 'agentAuthRequired';
    reason: string;
    authUrl: string;
    requestId: string;
  };
  type Response =
    | ChatMLFetcher.SuccessfulResponse
    | ChatMLFetcher.CanceledResponse
    | ChatMLFetcher.FailedResponse
    | ChatMLFetcher.AuthRequiredResponse;
  type Params = {
    modelConfiguration: Model.Configuration;
    messages: Chat.ElidableChatMessage[];
    uiKind: UiKind;
  } & Partial<{
    temperature: OpenAIFetcher.ConversationRequest['temperature'];
    num_suggestions: OpenAIFetcher.ConversationRequest['n'];
    stop: OpenAIFetcher.ConversationRequest['stop'];
    topP: OpenAIFetcher.ConversationRequest['top_p'];
    logitBias: OpenAIFetcher.ConversationRequest['logit_bias'];
    tools: OpenAIFetcher.ConversationRequest['tools'];
    tool_choice: OpenAIFetcher.ConversationRequest['tool_choice'];
    engineUrl: string;
    endpoint: string;
    authToken: string;
    intentParams: Partial<OpenAIFetcher.ConversationParams>;
    telemetryProperties: TelemetryProperties;
    telemetryMeasurements: TelemetryMeasurements;
  }>;
}
declare class ChatMLFetcher {
  readonly ctx: Context;
  readonly fetcher: OpenAIChatMLFetcher;
  constructor(ctx: Context);
  fetchResponse(
    params: ChatMLFetcher.Params,
    cancellationToken: CancellationToken,
    finishedCb?: SSEProcessor.FinishedCb
  ): Promise<ChatMLFetcher.Response>;
  fetch(
    chatParams: OpenAIFetcher.ConversationParams,
    finishedCb?: SSEProcessor.FinishedCb,
    cancellationToken?: CancellationToken,
    telemetryProperties?: TelemetryProperties,
    telemetryMeasurements?: TelemetryMeasurements
  ): Promise<ChatMLFetcher.Response>;
  processSuccessfulResponse(
    response: Extract<
      OpenAIFetcher.ConversationResponse,
      {
        type: 'success';
      }
    >,
    requestId: string, // ourRequestId
    telemetryProperties?: TelemetryProperties
  ): Promise<ChatMLFetcher.SuccessfulResponse>;
  postProcess(
    chatCompletion: ChatCompletion,
    telemetryProperties?: TelemetryProperties
  ): Promise<ChatCompletion | undefined>;
  processCanceledResponse(
    response: Extract<
      OpenAIFetcher.ConversationResponse,
      {
        type: 'canceled';
      }
    >,
    requestId: string
  ): any;
  processFailedResponse(
    response: Extract<
      OpenAIFetcher.ConversationResponse,
      {
        type: 'failed';
      }
    >,
    requestId: string
  ): ChatMLFetcher.FailedResponse;
  processError(err: Error, requestId: string): ChatMLFetcher.CanceledResponse | ChatMLFetcher.FailedResponse;
}

declare abstract class ConversationInspector {
  abstract inspectFetchResult(fetchResult: ChatMLFetcher.Response): void;
  abstract inspectPrompt(options: { type: PromptType; prompt: string; tokens: number }): void;
  abstract documentDiff(diff: { original: string; updated: string }): void;
}

interface IScoring {
  score(vector1: number[], vector2: number[]): number;
  terminateScoring(): void;
}
type RankingAlgorithmStatus = 'notStarted' | 'started' | 'completed';
type Chunk = string;
type ChunkId = string;
type DocumentChunk = {
  id: ChunkId;
  chunk: Chunk;
};
interface IRanking<T = Chunk> {
  initialize(chunks: T[]): Promise<void>;
  get status(): RankingAlgorithmStatus;
  addChunks(chunks: T[]): void;
  deleteEmbeddings(chunkIds: ChunkId[]): void;
  terminateRanking(): void;
  query(userQueries: string[]): Promise<T[]>;
}
interface IChunking {
  chunk(doc: TextDocument$1, modelConfig: Model.Configuration): Promise<DocumentChunk[]>;
}

type ChunkingAlgorithmType = string;

type FilePath = string;
declare class WorkspaceChunks {
  private _chunks;
  private fileChunksIds;
  private reverseChunks;
  get chunks(): LRUCacheMap<ChunkId, Chunk>;
  get chunkCount(): number;
  getChunk(id: ChunkId): Chunk | undefined;
  chunksForFile(filepath: FilePath): Chunk[];
  chunkId(chunk: Chunk): ChunkId | undefined;
  addChunks(chunks: DocumentChunk[]): void;
  addChunksForFile(filepath: FilePath, chunks: DocumentChunk[]): void;
  deleteChunks(ids: ChunkId[]): void;
  deleteSubfolderChunks(subfolder: string): ChunkId[];
  deleteFileChunks(filepath: FilePath): ChunkId[];
  clear(): void;
}

declare class ChunkingHandler {
  private implementation;
  status: 'notStarted' | 'started' | 'cancelled' | 'completed';
  private workspaceChunks;
  private cancellationToken;
  private needsDeletion;
  private modelConfig?;
  constructor(implementation: IChunking);
  chunk(ctx: Context, workspaceFolder: string): Promise<WorkspaceChunks['chunks']>;
  chunkFile(
    ctx: Context,
    fileUri: {
      fsPath: string;
    }
  ): Promise<Chunk[]>;
  private _chunk;
  private updateModelConfig;
  terminateChunking(): void;
  markForDeletion(): void;
  cancelDeletion(): void;
  isMarkedForDeletion(): boolean;
  get chunks(): LRUCacheMap<string, string>;
  get chunkCount(): number;
  chunkId(chunk: Chunk): ChunkId | undefined;
  deleteSubfolderChunks(subfolder: string): ChunkId[];
  deleteFileChunks(filepath: { fsPath: string }): ChunkId[];
}

declare class ChunkingProvider {
  private workspaceChunkingProviders;
  createImplementation(type: ChunkingAlgorithmType): ChunkingHandler;
  getImplementation(workspaceFolder: string, type?: ChunkingAlgorithmType): ChunkingHandler;
  getParentFolder(workspaceFolder: string): string | undefined;
  isChunked(workspaceFolder: string): boolean;
  status(workspaceFolder: string): 'cancelled' | 'notStarted' | 'started' | 'completed';
  chunkCount(workspaceFolder: string): number;
  chunkId(workspaceFolder: string, chunk: Chunk): ChunkId | undefined;
  terminateChunking(workspaceFolder: string): void;
  deleteSubfolderChunks(parentFolder: string, workspaceFolder: string): ChunkId[];
  deleteFileChunks(workspaceFolder: string, filepaths: URI | URI[]): ChunkId[];
  isMarkedForDeletion(workspaceFolder: string): boolean;
  markForDeletion(workspaceFolder: string): void;
  cancelDeletion(workspaceFolder: string): void;
  chunk(ctx: Context, workspaceFolder: string, type?: ChunkingAlgorithmType): Promise<LRUCacheMap<ChunkId, Chunk>>;
  chunkFiles(
    ctx: Context,
    workspaceFolder: string,
    filepath: {
      fsPath: string;
    }[],
    type?: ChunkingAlgorithmType
  ): Promise<Chunk[]>;
}

declare class RankingProvider {
  private workspaceRankingProviders;
  createImplementation(ctx: Context, type: string): IRanking;
  getImplementation(ctx: Context, workspaceFolder: string, type?: string): IRanking;
  status(ctx: Context, workspaceFolder: string, type?: string): RankingAlgorithmStatus;
  initialize(ctx: Context, workspaceFolder: string, chunks: Map<ChunkId, Chunk>, type?: string): void;
  addChunks(ctx: Context, workspaceFolder: string, chunks: Chunk[], type?: string): void;
  query(ctx: Context, workspaceFolder: string, queries: string[], type?: string): Promise<string[]>;
  terminateRanking(ctx: Context, workspaceFolder: string, type?: string): void;
  deleteEmbeddings(ctx: Context, workspaceFolder: string, chunkIds: ChunkId[], type?: string): void;
}

declare class ScoringProvider {
  private workspaceScoringProviders;
  constructor();
  createImplementation(ctx: Context, type: string): IScoring;
  getImplementation(ctx: Context, workspaceFolder: string, type?: string): IScoring;
  score(ctx: Context, workspaceFolder: string, vector1: number[], vector2: number[], type: string): number;
  terminateScoring(ctx: Context, workspaceFolder: string, type?: string): void;
}

type ProductContextKeys = {
  ConfigProvider: ConfigProvider;
  Clock: Clock;
  BuildInfo: BuildInfo;
  CompletionsCache: CompletionsCache;
  CopilotTokenNotifier: CopilotTokenNotifier;
  RootCertificateReader: RootCertificateReader;
  ProxySocketFactory: ProxySocketFactory;
  LanguageDetection: LanguageDetection;
  Features: Features;
  PostInsertionNotifier: PostInsertionNotifier;
  ExceptionRateLimiter: ExceptionRateLimiter;
  TelemetryUserConfig: TelemetryUserConfig;
  TelemetryReporters: TelemetryReporters;
  TelemetryInitialization: TelemetryInitialization;
  HeaderContributors: HeaderContributors;
  UserErrorNotifier: UserErrorNotifier;
  ContextualFilterManager: ContextualFilterManager;
  OpenAIFetcher: OpenAIFetcher;
  BlockModeConfig: BlockModeConfig;
  ExpConfigMaker: ExpConfigMaker;
  PromiseQueue: PromiseQueue;
  SnippetOrchestrator: SnippetOrchestrator;
  LastGhostText: LastGhostText;
  ForceMultiLine: ForceMultiLine;
  RepositoryManager: RepositoryManager;
  GitConfigLoader: GitConfigLoader;
  WorkspaceNotifier: WorkspaceNotifier;
  AvailableModelManager: AvailableModelManager;
  GitHubAppInfo: GitHubAppInfo;
  RuntimeMode: RuntimeMode;
  LogTarget: LogTarget;
};
type AgentConversationSkillKeys = {
  Conversations: Conversations;
  ConversationDumper: ConversationDumper;
  ConversationPromptEngine: ConversationPromptEngine;
  ModelConfigurationProvider: ModelConfigurationProvider;
  SyntheticTurns: SyntheticTurns;
  ConversationProgress: ConversationProgress;
  PreconditionsCheck: PreconditionsCheck;
  PreconditionsNotifier: PreconditionsNotifier;
  CapiVersionHeaderContributor: CapiVersionHeaderContributor;
  ModelMetadataProvider: ModelMetadataProvider;
  TurnProcessorFactory: TurnProcessorFactory;
  BlackbirdIndexingStatus: BlackbirdIndexingStatus;
  ConversationInspector: ConversationInspector;
  ChunkingProvider: ChunkingProvider;
  RankingProvider: RankingProvider;
  ScoringProvider: ScoringProvider;
  ConversationSkillRegistry: ConversationSkillRegistry;
};
type AgentContextKeys = AgentConversationSkillKeys &
  ProductContextKeys & {
    AgentConfigProvider: AgentConfigProvider;
    CopilotCapabilitiesProvider: CopilotCapabilitiesProvider;
    InitializedNotifier: InitializedNotifier;
    Fetcher: Fetcher;
    PersistenceManager: PersistenceManager;
    CopilotTokenManager: CopilotTokenManager;
    AgentCopilotTokenManager: AgentCopilotTokenManager;
    AuthPersistence: AuthPersistence;
    AuthManager: AuthManager;
    GitHubDeviceFlow: GitHubDeviceFlow;
    EditorSession: EditorSession;
    EditorAndPluginInfo: EditorAndPluginInfo;
    MethodHandlers: MethodHandlers;
    CopilotCompletionCache: CopilotCompletionCache;
    FileSystem: FileSystem;
    RelatedFilesProvider: RelatedFilesProvider;
    WorkspaceWatcherProvider: WorkspaceWatcherProvider;
    LspFileWatcher: LspFileWatcher;
    Service: Service;
    NotificationSender: NotificationSender;
    UrlOpener: UrlOpener;
    StatusReporter: StatusReporter;
    FeatureFlagsNotifier: FeatureFlagsNotifier;
    TextDocumentManager: TextDocumentManager;
    AgentTextDocumentManager: AgentTextDocumentManager;
    FileReader: FileReader;
    NetworkConfiguration: NetworkConfiguration;
    CopilotContentExclusionManager: CopilotContentExclusionManager;
    WorkDoneProgressTokens: WorkDoneProgressTokens;
  };

export { type AgentContextKeys, Context, type ProductContextKeys };
