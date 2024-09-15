import { TamperContext } from './tamperContext';

class DummyCopilotToken {
  readonly envelope: any;
  readonly token: string;
  readonly organization_list: string[];
  readonly enterprise_list: string[];
  readonly tokenMap: Map<string, string>;

  constructor() {
    this.token = 'dummy-copilot-token';
    this.organization_list = [];
    this.enterprise_list = [];
    this.envelope = {
      token: this.token,
      organization_list: this.enterprise_list,
      enterprise_list: this.organization_list,
      expires_at: 0,
      refresh_in: 0,
      // endpoints: {
      //   api: '',
      //   telemetry: '',
      //   //proxy: 'http://copilot-proxy.localhost:8001',
      //   proxy: 'http://localhost:11434',
      //   'origin-tracker': 'http://origin-tracker.localhost:8001',
      // },
    };

    this.tokenMap = new Map<string, string>([
      ['rt', ''],
      ['sn', ''],
      ['tid', ''], // tracking id
      ['sku', ''],
      // ModelIds
      // ../../../lib/src/openai/model.ts
      ['cml', ''],
    ]);
  }

  get expiresAt(): number {
    return this.envelope.expires_at;
  }

  get refreshIn(): number {
    return this.envelope.refresh_in;
  }

  isExpired(): boolean {
    return false;
  }

  getTokenValue(key: string): string | undefined {
    return this.tokenMap.get(key);
  }
}

const dummyToken = new DummyCopilotToken();

function dummyAuth(tctx: TamperContext) {
  tctx.tamper('AuthManager', (instance) => {
    const dummyRecord = {
      user: 'dummy-user',
      oauth_token: 'dummy-token',
      githubAppId: 'Iv1.0000000000000000',
    };
    const dummyStatus = {
      status: 'OK' as 'OK',
      user: 'dummy-user',
    };
    instance.checkAndUpdateStatus = instance.getPendingSignIn = async () => dummyStatus;
    instance.getPersistedAuthRecord = instance.getAuthRecord = async () => dummyRecord;
    instance.getGitHubToken = async () => ({ token: dummyRecord.oauth_token });

    return instance;
  });

  tctx.tamper('CopilotTokenManager', (instance) => {
    let notify = true;
    instance.getGitHubToken = async () => 'dummy-github-session';
    instance.getGitHubSession = async () => ({ token: 'dummy-github-session' });
    instance.getCopilotToken = async () => {
      if (notify && tctx.getByName('CopilotTokenNotifier')) {
        notify = false;
        tctx.getByName('CopilotTokenNotifier').emit('onCopilotToken', dummyToken as any);
      }
      return dummyToken as any;
    };
    instance.resetCopilotToken = () => {};
    instance.checkCopilotToken = async () => ({ status: 'OK' as 'OK' });

    return instance;
  });
}

function emptyCerts(tctx: TamperContext) {
  tctx.tamper('RootCertificateReader', (instance) => {
    instance.getAllRootCAs = async () => [];
    return instance;
  });
}

function buildType(tctx: TamperContext, buildType: string) {
  tctx.tamper('BuildInfo', (instance) => {
    instance.getBuildType = () => buildType;
    return instance;
  });
}

function nukeTelemetry(tctx: TamperContext) {
  tctx.tamper('TelemetryInitialization', (instance) => {
    instance.initialize = async () => {};
    instance.reInitialize = async () => {};
    Object.defineProperty(instance, 'isInitialized', {
      get: () => true,
    });
    return instance;
  });

  tctx.tamper('TelemetryReporters', (instance) => {
    instance.deactivate();
    return instance;
  });
}

export { dummyAuth, emptyCerts, buildType, nukeTelemetry };
