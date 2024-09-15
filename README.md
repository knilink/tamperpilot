# Tamperpilot
A GitHub Copilot modding tool for enhancing user's local experience by overriding app context with custom script.

## Quick start
1. Clone this project
```sh
git clone https://github.com/knilink/tamperpilot.git
```

2. Clone the copilot script to be tamper with
```sh
git clone https://github.com/github/copilot.vim.git
```

3. Install dependencies
```sh
cd tamperpilot
npm install
```

4. Patch script
```sh
npm run patch openAI ../copilot.vim/dist/language-server.js
```
where "openAI" is the build entry of the script to be injected, which is src/openAI.ts
If this step succeed, there should be a `../copilot.vim/dist/language-server-tampered.js` generated.


5. Test the script(optional). It should work with any openai compatible api, here use ollama at `http://localhost:11434` as an example
```sh
npm run test-completion -- \
  ../copilot.vim/dist/language-server-tampered.js --stdio --debug \
  --baseUrl=http://localhost:11434 \
  --model=deepseek-coder-v2:16b-lite-base-q4_K_M \
  --stop='<|file_separator|>' --stop=$'\n'
```
When testing with ollama, make sure the model support FIM and the model file is the latest, *AVOID* `codegemma` as its tokenizer is required to be fixed with latest llamacpp/ollama.
If this step succeed, log message `completion  {"completions":[..., "text":"    age = current_year - birth_year", ...}]}` can be seen at the last line.

If the completion is empty, check the log for `[fetchCompletions] request.response: [http://localhost:11434/v1/completions]` to make sure the request is sending to the specified `--baseUrl`, as well as server's non 200 responses.

## How build a custom script
Below is an example to show necessary to build a custom injection script.
First, create a file in `src` folder, `src/myScript.ts` for example, with following content.
```typescript
// file://.src/myScript.ts
// import TamperContext
import { TamperContext } from './utils/tamperContext';
// optionally import presets to be applied
import { dummyAuth } from './utils/presets';

// create a tamper context instance
const tctx = new TamperContext();

// optionally apply preset
dummyAuth(tctx);

// setup hook, here use 'BuildInfo' as an example
tctx.tamper(
  // name of the context, more can be found in src/utils/contextKeys.d.ts
  'BuildInfo',
  (
    // instance of the context
    instance,
    // class or abstract class of the context, could be optionally used for extending
    BuildInfo
  ) => {
    // overriding method function, monkey patching is recommanded to minimize the chance of breaking
    instance.getDisplayVersion = () => '3.14.159-tampered';

    // must return the instance of `BuildInfo` or classes extends `BuildInfo`
    return instance;
  }
);

// export context instance as default, this step is IMPORTANT.
export default tctx;
```
Then run the patch
```sh
npm run patch myScript ../copilot.vim/dist/language-server.js
```
Finally, test the patch
```sh
npm run test-completion -- ../copilot.vim/dist/language-server-tampered.js --stdio --debug
```
If succeed, version `3.14.159-tampered` can be seen in the initial debug log message `[lsp] GitHub Copilot Language Server 3.14.159-tampered initialized`.

More context info can be found in `src/utils/contextKeys.d.ts`, typing was done based on `copilot.vim#v1.38.0` so could be inconsistent with other versions, below are contexts that are considered useful:
- Fetcher: the context responsible sending all http requests.
- NetworkConfiguration: defines a bunch of URLs
- ConfigProvider: provides config
- AuthManager, CopilotTokenManager: handling auth
