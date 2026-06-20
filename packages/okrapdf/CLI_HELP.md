# CLI Help (Generated)

Generated from the live Commander command tree in `src/cli/bin.ts`.
Do not edit manually. Run `npm run docs:cli` in `packages/okrapdf`.

## `okra --help`

```text
Usage: okra [options] [command]

okraPDF CLI — upload PDFs, chat with documents, and extract structured data

Options:
  -V, --version                                   output the version number
  -j, --json                                      Output JSON (structured, machine-readable)
  -q, --quiet                                     Suppress progress and human-readable frills
  -o, --output <format-or-file>                   Output format (json|table) or write output to file
  -h, --help                                      display help for command

Commands:
  upload [options] <source>                       Upload a PDF and wait for processing
  doctor [options]                                Diagnose CLI setup
  resources|resource                              List API resources
  content-types|content-type                      List content types
  invoice|inv                                     Extract invoice data
  receipt|rcpt                                    Extract receipt data
  documents|document                              Work with processed documents
  files|file                                      Work with uploaded file assets
  jobs|job                                        Inspect parse/render/workflow jobs
  agents|agent                                    Inspect registered agents
  context                                         Context-first source tools
  workflows|workflow                              Run dataset-backed workflow evals
  parse [options] <documentId>                    Create document parse job
  audit [options] <documentId>                    Run audit workflow
  redact [options] <documentId>                   Run redaction workflow
  extract [options] [source]                      Upload a PDF and extract structured data
  render [options] <source>                       Render a PDF from a script, spec, or HTML
  ask [options] <sourceOrQuestion> [question...]  Ask about a document
  chat [options] <question>                       Ask a question about one document
  list|ls                                         List your documents
  read [options] <docId>                          Read document markdown
  open [options] <docId>                          Open document shell
  delete|rm <docId>                               Delete one document
  collections|collection                          Query across collections
  auth                                            Manage authentication
  profile                                         Manage cloud and self-host API profiles
  serve [options] [bundleDir]                     Serve a lightweight self-host runtime shell and API
  capability                                      Run isolated self-host capability services
  self-host                                       Validate self-host runtime, recipe, and capability bundles
  help [command]                                  display help for command

Primary workflows:
  okra auth login
  okra upload ./report.pdf                  # add --no-wait to queue; resume with okra jobs wait
  okra documents read doc-abc123 --pages 1-3
  okra chat "Summarize this document" --doc doc-abc123

Grounded context (agent loop):
  okra context structure doc-abc123
  okra context get "termination clause" --source-id doc-abc123
  okra context ask "What is the guaranteed fee?" --source-id doc-abc123
  okra parse doc-abc123 --model gemini-3-flash --prompt layout-bbox-gemini-multipage@1 # then: okra jobs wait doc-abc123

More:
  okra extract ./report.pdf --schema ./schema.json
  okra render ./report.py --out report.pdf
  okra audit doc-abc123 --standard wcag
  okra redact doc-abc123 --model local
  okra open doc-abc123 --view review
  okra collections query earnings "What changed quarter over quarter?" -o earnings.csv
  okra doctor --json
  okra workflows steps
  okra workflows build ./workflow.json --json
  okra resources list                       # discover every API noun and verb
  okra documents list

Self-hosting:
  okra profile add local --base-url https://my-okra.up.railway.app
  okra self-host --help                     # validate → materialize → proof → railway → smoke
  okra serve ./runtime --port 8787

Advanced inspection and local-only commands are intentionally hidden from
default help during the v0.14 clean-house release candidate.
```

## `okra auth --help`

```text
Usage: okra auth [options] [command]

Manage authentication

Options:
  -h, --help        display help for command

Commands:
  login [options]   Save API key to global config
  set-key <apiKey>  Save API key to global config (non-interactive)
  status [options]  Show authentication status
  whoami            Show current auth identity (alias for status)
  token             Print active API key to stdout
  logout            Remove API key from global config
  help [command]    display help for command
```

## `okra auth status --help`

```text
Usage: okra auth status [options]

Show authentication status

Options:
  --validate  Verify the configured API key with the API
  -h, --help  display help for command
```

## `okra doctor --help`

```text
Usage: okra doctor [options]

Run CLI, config, auth, and API diagnostics

Options:
  --base-url <url>  Override API base URL for diagnostic probes
  -h, --help        display help for command
```

## `okra upload --help`

```text
Usage: okra upload [options] <source>

Upload a PDF (file path, URL, or '-' for stdin), wait for processing

Options:
  --no-wait                 Fire-and-forget (don't wait for processing)
  --wait-timeout <seconds>  Maximum seconds to wait for processing
  --vendor-options <json>   JSON vendor-specific options (e.g.,
                            '{"model":"gemini-3.1-pro","parse_mode":"parse_page_with_agent"}')
  -h, --help                display help for command
```

## `okra bridge --help`

```text
Usage: okra [options] [command]

okraPDF CLI — upload PDFs, chat with documents, and extract structured data

Options:
  -V, --version                                   output the version number
  -j, --json                                      Output JSON (structured, machine-readable)
  -q, --quiet                                     Suppress progress and human-readable frills
  -o, --output <format-or-file>                   Output format (json|table) or write output to file
  -h, --help                                      display help for command

Commands:
  upload [options] <source>                       Upload a PDF and wait for processing
  doctor [options]                                Diagnose CLI setup
  resources|resource                              List API resources
  content-types|content-type                      List content types
  invoice|inv                                     Extract invoice data
  receipt|rcpt                                    Extract receipt data
  documents|document                              Work with processed documents
  files|file                                      Work with uploaded file assets
  jobs|job                                        Inspect parse/render/workflow jobs
  agents|agent                                    Inspect registered agents
  context                                         Context-first source tools
  workflows|workflow                              Run dataset-backed workflow evals
  parse [options] <documentId>                    Create document parse job
  audit [options] <documentId>                    Run audit workflow
  redact [options] <documentId>                   Run redaction workflow
  extract [options] [source]                      Upload a PDF and extract structured data
  render [options] <source>                       Render a PDF from a script, spec, or HTML
  ask [options] <sourceOrQuestion> [question...]  Ask about a document
  chat [options] <question>                       Ask a question about one document
  list|ls                                         List your documents
  read [options] <docId>                          Read document markdown
  open [options] <docId>                          Open document shell
  delete|rm <docId>                               Delete one document
  collections|collection                          Query across collections
  auth                                            Manage authentication
  profile                                         Manage cloud and self-host API profiles
  serve [options] [bundleDir]                     Serve a lightweight self-host runtime shell and API
  capability                                      Run isolated self-host capability services
  self-host                                       Validate self-host runtime, recipe, and capability bundles
  help [command]                                  display help for command

Primary workflows:
  okra auth login
  okra upload ./report.pdf                  # add --no-wait to queue; resume with okra jobs wait
  okra documents read doc-abc123 --pages 1-3
  okra chat "Summarize this document" --doc doc-abc123

Grounded context (agent loop):
  okra context structure doc-abc123
  okra context get "termination clause" --source-id doc-abc123
  okra context ask "What is the guaranteed fee?" --source-id doc-abc123
  okra parse doc-abc123 --model gemini-3-flash --prompt layout-bbox-gemini-multipage@1 # then: okra jobs wait doc-abc123

More:
  okra extract ./report.pdf --schema ./schema.json
  okra render ./report.py --out report.pdf
  okra audit doc-abc123 --standard wcag
  okra redact doc-abc123 --model local
  okra open doc-abc123 --view review
  okra collections query earnings "What changed quarter over quarter?" -o earnings.csv
  okra doctor --json
  okra workflows steps
  okra workflows build ./workflow.json --json
  okra resources list                       # discover every API noun and verb
  okra documents list

Self-hosting:
  okra profile add local --base-url https://my-okra.up.railway.app
  okra self-host --help                     # validate → materialize → proof → railway → smoke
  okra serve ./runtime --port 8787

Advanced inspection and local-only commands are intentionally hidden from
default help during the v0.14 clean-house release candidate.
```

## `okra select --help`

```text
Usage: okra [options] [command]

okraPDF CLI — upload PDFs, chat with documents, and extract structured data

Options:
  -V, --version                                   output the version number
  -j, --json                                      Output JSON (structured, machine-readable)
  -q, --quiet                                     Suppress progress and human-readable frills
  -o, --output <format-or-file>                   Output format (json|table) or write output to file
  -h, --help                                      display help for command

Commands:
  upload [options] <source>                       Upload a PDF and wait for processing
  doctor [options]                                Diagnose CLI setup
  resources|resource                              List API resources
  content-types|content-type                      List content types
  invoice|inv                                     Extract invoice data
  receipt|rcpt                                    Extract receipt data
  documents|document                              Work with processed documents
  files|file                                      Work with uploaded file assets
  jobs|job                                        Inspect parse/render/workflow jobs
  agents|agent                                    Inspect registered agents
  context                                         Context-first source tools
  workflows|workflow                              Run dataset-backed workflow evals
  parse [options] <documentId>                    Create document parse job
  audit [options] <documentId>                    Run audit workflow
  redact [options] <documentId>                   Run redaction workflow
  extract [options] [source]                      Upload a PDF and extract structured data
  render [options] <source>                       Render a PDF from a script, spec, or HTML
  ask [options] <sourceOrQuestion> [question...]  Ask about a document
  chat [options] <question>                       Ask a question about one document
  list|ls                                         List your documents
  read [options] <docId>                          Read document markdown
  open [options] <docId>                          Open document shell
  delete|rm <docId>                               Delete one document
  collections|collection                          Query across collections
  auth                                            Manage authentication
  profile                                         Manage cloud and self-host API profiles
  serve [options] [bundleDir]                     Serve a lightweight self-host runtime shell and API
  capability                                      Run isolated self-host capability services
  self-host                                       Validate self-host runtime, recipe, and capability bundles
  help [command]                                  display help for command

Primary workflows:
  okra auth login
  okra upload ./report.pdf                  # add --no-wait to queue; resume with okra jobs wait
  okra documents read doc-abc123 --pages 1-3
  okra chat "Summarize this document" --doc doc-abc123

Grounded context (agent loop):
  okra context structure doc-abc123
  okra context get "termination clause" --source-id doc-abc123
  okra context ask "What is the guaranteed fee?" --source-id doc-abc123
  okra parse doc-abc123 --model gemini-3-flash --prompt layout-bbox-gemini-multipage@1 # then: okra jobs wait doc-abc123

More:
  okra extract ./report.pdf --schema ./schema.json
  okra render ./report.py --out report.pdf
  okra audit doc-abc123 --standard wcag
  okra redact doc-abc123 --model local
  okra open doc-abc123 --view review
  okra collections query earnings "What changed quarter over quarter?" -o earnings.csv
  okra doctor --json
  okra workflows steps
  okra workflows build ./workflow.json --json
  okra resources list                       # discover every API noun and verb
  okra documents list

Self-hosting:
  okra profile add local --base-url https://my-okra.up.railway.app
  okra self-host --help                     # validate → materialize → proof → railway → smoke
  okra serve ./runtime --port 8787

Advanced inspection and local-only commands are intentionally hidden from
default help during the v0.14 clean-house release candidate.
```

## `okra action --help`

```text
Usage: okra [options] [command]

okraPDF CLI — upload PDFs, chat with documents, and extract structured data

Options:
  -V, --version                                   output the version number
  -j, --json                                      Output JSON (structured, machine-readable)
  -q, --quiet                                     Suppress progress and human-readable frills
  -o, --output <format-or-file>                   Output format (json|table) or write output to file
  -h, --help                                      display help for command

Commands:
  upload [options] <source>                       Upload a PDF and wait for processing
  doctor [options]                                Diagnose CLI setup
  resources|resource                              List API resources
  content-types|content-type                      List content types
  invoice|inv                                     Extract invoice data
  receipt|rcpt                                    Extract receipt data
  documents|document                              Work with processed documents
  files|file                                      Work with uploaded file assets
  jobs|job                                        Inspect parse/render/workflow jobs
  agents|agent                                    Inspect registered agents
  context                                         Context-first source tools
  workflows|workflow                              Run dataset-backed workflow evals
  parse [options] <documentId>                    Create document parse job
  audit [options] <documentId>                    Run audit workflow
  redact [options] <documentId>                   Run redaction workflow
  extract [options] [source]                      Upload a PDF and extract structured data
  render [options] <source>                       Render a PDF from a script, spec, or HTML
  ask [options] <sourceOrQuestion> [question...]  Ask about a document
  chat [options] <question>                       Ask a question about one document
  list|ls                                         List your documents
  read [options] <docId>                          Read document markdown
  open [options] <docId>                          Open document shell
  delete|rm <docId>                               Delete one document
  collections|collection                          Query across collections
  auth                                            Manage authentication
  profile                                         Manage cloud and self-host API profiles
  serve [options] [bundleDir]                     Serve a lightweight self-host runtime shell and API
  capability                                      Run isolated self-host capability services
  self-host                                       Validate self-host runtime, recipe, and capability bundles
  help [command]                                  display help for command

Primary workflows:
  okra auth login
  okra upload ./report.pdf                  # add --no-wait to queue; resume with okra jobs wait
  okra documents read doc-abc123 --pages 1-3
  okra chat "Summarize this document" --doc doc-abc123

Grounded context (agent loop):
  okra context structure doc-abc123
  okra context get "termination clause" --source-id doc-abc123
  okra context ask "What is the guaranteed fee?" --source-id doc-abc123
  okra parse doc-abc123 --model gemini-3-flash --prompt layout-bbox-gemini-multipage@1 # then: okra jobs wait doc-abc123

More:
  okra extract ./report.pdf --schema ./schema.json
  okra render ./report.py --out report.pdf
  okra audit doc-abc123 --standard wcag
  okra redact doc-abc123 --model local
  okra open doc-abc123 --view review
  okra collections query earnings "What changed quarter over quarter?" -o earnings.csv
  okra doctor --json
  okra workflows steps
  okra workflows build ./workflow.json --json
  okra resources list                       # discover every API noun and verb
  okra documents list

Self-hosting:
  okra profile add local --base-url https://my-okra.up.railway.app
  okra self-host --help                     # validate → materialize → proof → railway → smoke
  okra serve ./runtime --port 8787

Advanced inspection and local-only commands are intentionally hidden from
default help during the v0.14 clean-house release candidate.
```

## `okra active-doc --help`

```text
Usage: okra [options] [command]

okraPDF CLI — upload PDFs, chat with documents, and extract structured data

Options:
  -V, --version                                   output the version number
  -j, --json                                      Output JSON (structured, machine-readable)
  -q, --quiet                                     Suppress progress and human-readable frills
  -o, --output <format-or-file>                   Output format (json|table) or write output to file
  -h, --help                                      display help for command

Commands:
  upload [options] <source>                       Upload a PDF and wait for processing
  doctor [options]                                Diagnose CLI setup
  resources|resource                              List API resources
  content-types|content-type                      List content types
  invoice|inv                                     Extract invoice data
  receipt|rcpt                                    Extract receipt data
  documents|document                              Work with processed documents
  files|file                                      Work with uploaded file assets
  jobs|job                                        Inspect parse/render/workflow jobs
  agents|agent                                    Inspect registered agents
  context                                         Context-first source tools
  workflows|workflow                              Run dataset-backed workflow evals
  parse [options] <documentId>                    Create document parse job
  audit [options] <documentId>                    Run audit workflow
  redact [options] <documentId>                   Run redaction workflow
  extract [options] [source]                      Upload a PDF and extract structured data
  render [options] <source>                       Render a PDF from a script, spec, or HTML
  ask [options] <sourceOrQuestion> [question...]  Ask about a document
  chat [options] <question>                       Ask a question about one document
  list|ls                                         List your documents
  read [options] <docId>                          Read document markdown
  open [options] <docId>                          Open document shell
  delete|rm <docId>                               Delete one document
  collections|collection                          Query across collections
  auth                                            Manage authentication
  profile                                         Manage cloud and self-host API profiles
  serve [options] [bundleDir]                     Serve a lightweight self-host runtime shell and API
  capability                                      Run isolated self-host capability services
  self-host                                       Validate self-host runtime, recipe, and capability bundles
  help [command]                                  display help for command

Primary workflows:
  okra auth login
  okra upload ./report.pdf                  # add --no-wait to queue; resume with okra jobs wait
  okra documents read doc-abc123 --pages 1-3
  okra chat "Summarize this document" --doc doc-abc123

Grounded context (agent loop):
  okra context structure doc-abc123
  okra context get "termination clause" --source-id doc-abc123
  okra context ask "What is the guaranteed fee?" --source-id doc-abc123
  okra parse doc-abc123 --model gemini-3-flash --prompt layout-bbox-gemini-multipage@1 # then: okra jobs wait doc-abc123

More:
  okra extract ./report.pdf --schema ./schema.json
  okra render ./report.py --out report.pdf
  okra audit doc-abc123 --standard wcag
  okra redact doc-abc123 --model local
  okra open doc-abc123 --view review
  okra collections query earnings "What changed quarter over quarter?" -o earnings.csv
  okra doctor --json
  okra workflows steps
  okra workflows build ./workflow.json --json
  okra resources list                       # discover every API noun and verb
  okra documents list

Self-hosting:
  okra profile add local --base-url https://my-okra.up.railway.app
  okra self-host --help                     # validate → materialize → proof → railway → smoke
  okra serve ./runtime --port 8787

Advanced inspection and local-only commands are intentionally hidden from
default help during the v0.14 clean-house release candidate.
```

## `okra events --help`

```text
Usage: okra [options] [command]

okraPDF CLI — upload PDFs, chat with documents, and extract structured data

Options:
  -V, --version                                   output the version number
  -j, --json                                      Output JSON (structured, machine-readable)
  -q, --quiet                                     Suppress progress and human-readable frills
  -o, --output <format-or-file>                   Output format (json|table) or write output to file
  -h, --help                                      display help for command

Commands:
  upload [options] <source>                       Upload a PDF and wait for processing
  doctor [options]                                Diagnose CLI setup
  resources|resource                              List API resources
  content-types|content-type                      List content types
  invoice|inv                                     Extract invoice data
  receipt|rcpt                                    Extract receipt data
  documents|document                              Work with processed documents
  files|file                                      Work with uploaded file assets
  jobs|job                                        Inspect parse/render/workflow jobs
  agents|agent                                    Inspect registered agents
  context                                         Context-first source tools
  workflows|workflow                              Run dataset-backed workflow evals
  parse [options] <documentId>                    Create document parse job
  audit [options] <documentId>                    Run audit workflow
  redact [options] <documentId>                   Run redaction workflow
  extract [options] [source]                      Upload a PDF and extract structured data
  render [options] <source>                       Render a PDF from a script, spec, or HTML
  ask [options] <sourceOrQuestion> [question...]  Ask about a document
  chat [options] <question>                       Ask a question about one document
  list|ls                                         List your documents
  read [options] <docId>                          Read document markdown
  open [options] <docId>                          Open document shell
  delete|rm <docId>                               Delete one document
  collections|collection                          Query across collections
  auth                                            Manage authentication
  profile                                         Manage cloud and self-host API profiles
  serve [options] [bundleDir]                     Serve a lightweight self-host runtime shell and API
  capability                                      Run isolated self-host capability services
  self-host                                       Validate self-host runtime, recipe, and capability bundles
  help [command]                                  display help for command

Primary workflows:
  okra auth login
  okra upload ./report.pdf                  # add --no-wait to queue; resume with okra jobs wait
  okra documents read doc-abc123 --pages 1-3
  okra chat "Summarize this document" --doc doc-abc123

Grounded context (agent loop):
  okra context structure doc-abc123
  okra context get "termination clause" --source-id doc-abc123
  okra context ask "What is the guaranteed fee?" --source-id doc-abc123
  okra parse doc-abc123 --model gemini-3-flash --prompt layout-bbox-gemini-multipage@1 # then: okra jobs wait doc-abc123

More:
  okra extract ./report.pdf --schema ./schema.json
  okra render ./report.py --out report.pdf
  okra audit doc-abc123 --standard wcag
  okra redact doc-abc123 --model local
  okra open doc-abc123 --view review
  okra collections query earnings "What changed quarter over quarter?" -o earnings.csv
  okra doctor --json
  okra workflows steps
  okra workflows build ./workflow.json --json
  okra resources list                       # discover every API noun and verb
  okra documents list

Self-hosting:
  okra profile add local --base-url https://my-okra.up.railway.app
  okra self-host --help                     # validate → materialize → proof → railway → smoke
  okra serve ./runtime --port 8787

Advanced inspection and local-only commands are intentionally hidden from
default help during the v0.14 clean-house release candidate.
```

## `okra watch --help`

```text
Usage: okra [options] [command]

okraPDF CLI — upload PDFs, chat with documents, and extract structured data

Options:
  -V, --version                                   output the version number
  -j, --json                                      Output JSON (structured, machine-readable)
  -q, --quiet                                     Suppress progress and human-readable frills
  -o, --output <format-or-file>                   Output format (json|table) or write output to file
  -h, --help                                      display help for command

Commands:
  upload [options] <source>                       Upload a PDF and wait for processing
  doctor [options]                                Diagnose CLI setup
  resources|resource                              List API resources
  content-types|content-type                      List content types
  invoice|inv                                     Extract invoice data
  receipt|rcpt                                    Extract receipt data
  documents|document                              Work with processed documents
  files|file                                      Work with uploaded file assets
  jobs|job                                        Inspect parse/render/workflow jobs
  agents|agent                                    Inspect registered agents
  context                                         Context-first source tools
  workflows|workflow                              Run dataset-backed workflow evals
  parse [options] <documentId>                    Create document parse job
  audit [options] <documentId>                    Run audit workflow
  redact [options] <documentId>                   Run redaction workflow
  extract [options] [source]                      Upload a PDF and extract structured data
  render [options] <source>                       Render a PDF from a script, spec, or HTML
  ask [options] <sourceOrQuestion> [question...]  Ask about a document
  chat [options] <question>                       Ask a question about one document
  list|ls                                         List your documents
  read [options] <docId>                          Read document markdown
  open [options] <docId>                          Open document shell
  delete|rm <docId>                               Delete one document
  collections|collection                          Query across collections
  auth                                            Manage authentication
  profile                                         Manage cloud and self-host API profiles
  serve [options] [bundleDir]                     Serve a lightweight self-host runtime shell and API
  capability                                      Run isolated self-host capability services
  self-host                                       Validate self-host runtime, recipe, and capability bundles
  help [command]                                  display help for command

Primary workflows:
  okra auth login
  okra upload ./report.pdf                  # add --no-wait to queue; resume with okra jobs wait
  okra documents read doc-abc123 --pages 1-3
  okra chat "Summarize this document" --doc doc-abc123

Grounded context (agent loop):
  okra context structure doc-abc123
  okra context get "termination clause" --source-id doc-abc123
  okra context ask "What is the guaranteed fee?" --source-id doc-abc123
  okra parse doc-abc123 --model gemini-3-flash --prompt layout-bbox-gemini-multipage@1 # then: okra jobs wait doc-abc123

More:
  okra extract ./report.pdf --schema ./schema.json
  okra render ./report.py --out report.pdf
  okra audit doc-abc123 --standard wcag
  okra redact doc-abc123 --model local
  okra open doc-abc123 --view review
  okra collections query earnings "What changed quarter over quarter?" -o earnings.csv
  okra doctor --json
  okra workflows steps
  okra workflows build ./workflow.json --json
  okra resources list                       # discover every API noun and verb
  okra documents list

Self-hosting:
  okra profile add local --base-url https://my-okra.up.railway.app
  okra self-host --help                     # validate → materialize → proof → railway → smoke
  okra serve ./runtime --port 8787

Advanced inspection and local-only commands are intentionally hidden from
default help during the v0.14 clean-house release candidate.
```

## `okra resources --help`

```text
Usage: okra resources|resource [options] [command]

Discover Okra API resources and actions

Options:
  -h, --help       display help for command

Commands:
  list|ls          List top-level API resources and action verbs
  show|get <name>  Show a resource or action contract
```

## `okra resources show --help`

```text
Usage: okra resources show|get [options] <name>

Show a resource or action contract

Options:
  -h, --help  display help for command
```

## `okra content-types --help`

```text
Usage: okra content-types|content-type [options] [command]

Discover typed extraction content types (schema + evidence + lifecycle)

Options:
  -h, --help     display help for command

Commands:
  list|ls        List registered content types
  show|get <id>  Show a content-type manifest (schema, fields, evidence policy)
```

## `okra content-types show --help`

```text
Usage: okra content-types show|get [options] <id>

Show a content-type manifest (schema, fields, evidence policy)

Options:
  -h, --help  display help for command
```

## `okra invoice --help`

```text
Usage: okra invoice|inv [options] [command]

Invoice extraction commands for content type "invoice"

Options:
  -h, --help                  display help for command

Commands:
  extract [options] <source>  Equivalent to "extract <source> --content-type
                              invoice"
```

## `okra invoice extract --help`

```text
Usage: okra invoice extract [options] <source>

Equivalent to "extract <source> --content-type invoice"

Options:
  --no-wait         Fire-and-forget
  --prompt <query>  Extraction prompt
  --cite            Return per-field source citations (page + bbox)
  -h, --help        display help for command
```

## `okra receipt --help`

```text
Usage: okra receipt|rcpt [options] [command]

Receipt extraction commands for content type "receipt"

Options:
  -h, --help                  display help for command

Commands:
  extract [options] <source>  Equivalent to "extract <source> --content-type
                              receipt"
```

## `okra receipt extract --help`

```text
Usage: okra receipt extract [options] <source>

Equivalent to "extract <source> --content-type receipt"

Options:
  --no-wait         Fire-and-forget
  --prompt <query>  Extraction prompt
  --cite            Return per-field source citations (page + bbox)
  -h, --help        display help for command
```

## `okra documents --help`

```text
Usage: okra documents|document [options] [command]

Document resource operations

Options:
  -h, --help                        display help for command

Commands:
  list|ls                           List processed documents
  upload [options] <source>         Upload a PDF into the document lifecycle
  get|status <docId>                Get document status and metadata
  read [options] <docId>            Read processed document markdown
  wait-for [options] <docId>        Wait until a matching document node is
                                    ingested
  urls|url <docId>                  Print deterministic document API URLs
  reparse [options] <docId>         Create a document.parse job for an existing
                                    document
  verify [options] <docId> <claim>  Verify a claim against a page using the
                                    vision model
  delete|rm <docId>                 Delete a document
```

## `okra documents read --help`

```text
Usage: okra documents read [options] <docId>

Read processed document markdown

Options:
  --pages <range>  Page range, e.g. 1-5
  -h, --help       display help for command
```

## `okra documents wait-for --help`

```text
Usage: okra documents wait-for [options] <docId>

Wait until a matching document node is ingested

Options:
  --match <term>       Term or FTS expression to wait for
  --timeout <seconds>  Maximum seconds to wait (default: "120")
  --literal            Use literal substring matching instead of FTS
  -h, --help           display help for command
```

## `okra files --help`

```text
Usage: okra files|file [options] [command]

Passive file resource operations

Options:
  -h, --help                 display help for command

Commands:
  list|ls [options]          List passive file assets
  upload [options] <source>  Upload a passive file asset without creating a
                             document
  get <fileId>               Get file metadata
  url <fileId>               Print the file bytes URL
  delete|rm <fileId>         Delete a passive file asset
```

## `okra jobs --help`

```text
Usage: okra jobs|job [options] [command]

Job resource operations

Options:
  -h, --help                   display help for command

Commands:
  list|ls [options]            List jobs
  get|show <jobId>             Get job status and result
  wait [options] <jobOrDocId>  Wait for a job, or for the latest document.parse
                               job for a document ID
  events <jobId>               Print the job event stream URL
  cancel <jobId>               Cancel a queued or running job
  retry <jobId>                Retry a failed job
  resume <jobId>               Resume a paused job
```

## `okra agents --help`

```text
Usage: okra agents|agent [options] [command]

Agent resource operations

Options:
  -h, --help     display help for command

Commands:
  list|ls        List registered agents
  get <agentId>  Get agent details
  profiles       List built-in runtime profiles
```

## `okra workflows --help`

```text
Usage: okra workflows|workflow [options] [command]

Validate and run composable OCR/gate/code/VLM eval workflows

Options:
  -h, --help              display help for command

Commands:
  catalog|list            List hosted workflow templates and capabilities
  steps                   Show the OCR/gate/code/VLM step primitives used to
                          build workflows
  examples                List built-in research workflow examples
  example <id>            Print a built-in research workflow definition as JSON
  validate <file>         Validate a workflow definition JSON file
  build [options] <file>  Validate and compile a step workflow into hosted
                          agent-workflow source
  run [options] <file>    Create a hosted workflow/eval run from a workflow
                          definition
  help [command]          display help for command
```

## `okra extract --help`

```text
Usage: okra extract [options] [source]

Extract structured data from a document (doc ID, URL, or file path)

Options:
  --no-wait            Fire-and-forget (don't wait for processing)
  --schema <file>      JSON Schema file or inline JSON for structured
                       extraction
  --content-type <id>  Extract using a registered content type (e.g. invoice) —
                       supplies the schema and grounding
  --prompt <query>     Extraction prompt (default: "Extract all data according
                       to the schema")
  --cite               Return per-field source citations (page + bbox) for each
                       extracted value
  -h, --help           display help for command
```

## `okra parse --help`

```text
Usage: okra parse [options] <documentId>

Create a document.parse job for an existing document

Options:
  --model <model>           Parser model id
  --prompt <prompt>         Parser prompt id or id@version
  --engine <engine>         Deprecated parser engine alias; use
                            --model/--prompt
  --strategy <strategy>     Parser strategy/vendor alias
  --wait                    Wait for the parse job to finish
  --wait-timeout <seconds>  Maximum seconds to wait when --wait is set
  -h, --help                display help for command
```

## `okra chat --help`

```text
Usage: okra chat [options] <question>

Ask a question about a processed document (canonical: okra context ask)

Options:
  --doc <id>      Document ID
  --model <name>  Override model
  --stream        Stream response tokens as they arrive
  -h, --help      display help for command
```

## `okra list --help`

```text
Usage: okra list|ls [options]

List all documents

Options:
  -h, --help  display help for command
```

## `okra open --help`

```text
Usage: okra open [options] <docId>

Print the active profile web-shell URL for a document

Options:
  --view <view>  Initial view: document | graph | parser | audit | redact |
                 review (default: "document")
  -h, --help     display help for command
```

## `okra read --help`

```text
Usage: okra read [options] <docId>

Read processed document markdown

Options:
  --pages <range>  Page range, e.g. 1-5
  -h, --help       display help for command
```

## `okra delete --help`

```text
Usage: okra delete|rm [options] <docId>

Delete a document

Options:
  -h, --help  display help for command
```

## `okra collections --help`

```text
Usage: okra collections|collection [options] [command]

Collection operations

Options:
  -h, --help                             display help for command

Commands:
  list|ls                                List collections
  query [options] <nameOrId> <question>  Ask the same question across a collection
  help [command]                         display help for command

Stable v0.14 collection workflow:
  okra collections query <name> "<question>"

Experimental structured fan-out remains available via:
  okra collections query <name> "<question>" --schema ./schema.json
  okra collections extract <name> --schema ./schema.json

Advanced collection management commands remain available but are
intentionally hidden from default help during the clean-house release
candidate.
```

## `okra collections query --help`

```text
Usage: okra collections query [options] <nameOrId> <question>

Fan-out query across collection documents

Options:
  --schema <file>  Experimental: JSON Schema file for structured extraction
  -h, --help       display help for command
```

## `okra collections extract --help`

```text
Usage: okra collections extract [options] <nameOrId>

Experimental: extract structured data from all documents in a collection

Options:
  --schema <file>      Experimental: JSON Schema file or inline JSON for
                       structured extraction
  --content-type <id>  Extract the whole corpus using a registered content type
                       (e.g. invoice) — supplies the schema and grounding
  --prompt <query>     Extraction prompt (default: auto-generated from schema)
  --cite               Per-field source citations (Anthropic page_location)
  -h, --help           display help for command
```

## `okra profile --help`

```text
Usage: okra profile [options] [command]

Manage cloud and self-host API profiles

Options:
  -h, --help            display help for command

Commands:
  add [options] <name>  Save a cloud or self-host API profile
  use <name>            Switch the active API profile
  current               Show the active API profile
  list                  List configured API profiles
  remove <name>         Remove an API profile
  help [command]        display help for command
```

## `okra serve --help`

```text
Usage: okra serve [options] [bundleDir]

Serve a lightweight self-host runtime shell and API

Options:
  --host <host>       Host interface to bind (default: "0.0.0.0")
  --port <port>       Port to bind (default: "8787")
  --public-dir <dir>  Override static asset directory
  -h, --help          display help for command
```

## `okra self-host --help`

```text
Usage: okra self-host [options] [command]

Validate self-host runtime, recipe, and capability bundles

Options:
  -h, --help                             display help for command

Commands:
  validate <bundleDir>                   Validate a self-host runtime bundle without starting a server
  materialize <bundleDir>                Write deterministic Railway/Docker publish artifacts into the bundle
  proof [options] <bundleDir>            Run no-server draft proof checks against the self-host runtime bundle
  plan [options] <bundleDir>             Render a self-host deploy preflight plan without deploying
  env [options] <bundleDir>              Render a self-host .env template without deploying
  compose [options] <bundleDir>          Render Docker Compose artifacts without starting services
  railway [options] <bundleDir>          Render Railway config-as-code for the public app service or a named service
  template <bundleDir>                   Render Railway template composer handoff without publishing
  template-listing <bundleDir>           Render Railway template listing metadata for publication
  network-plan <bundleDir>               Render Docker network handoff for separated services
  template-evidence <bundleDir>          Render Railway template publication evidence scaffold
  implementations <bundleDir>            Render capability implementation handoff without publishing images
  capability-evidence <bundleDir>        Render capability promotion evidence scaffold for production image handoff
  evidence-bundle [options] <bundleDir>  Render Railway publish evidence bundle scaffold
  publish-pack [options] <bundleDir>     Render Railway template publication pack with Docker/network separation
  readiness [options] <bundleDir>        Render Railway publish-readiness gates without publishing
  smoke [options] [baseUrl]              Run upload, parse, review workflow smoke checks against a self-host base URL
  serve [options] [bundleDir]            Serve a lightweight self-host runtime shell and API
  help [command]                         display help for command

Bundle pipeline (in order):
  okra self-host validate ./runtime
  okra self-host materialize ./runtime
  okra self-host plan ./runtime
  okra self-host env ./runtime
  okra self-host compose ./runtime
  okra self-host proof ./runtime --evidence-out self-host-draft.proof.json

Railway publishing:
  okra self-host railway ./runtime
  okra self-host network-plan ./runtime
  okra self-host template ./runtime
  okra self-host template-listing ./runtime
  okra self-host template-evidence ./runtime
  okra self-host implementations ./runtime
  okra self-host capability-evidence ./runtime
  okra self-host evidence-bundle ./runtime
  okra self-host publish-pack ./runtime
  okra self-host readiness ./runtime

Verify a deployed runtime:
  okra self-host smoke https://my-okra.up.railway.app --workflow both --evidence-out railway-smoke.evidence.json
  okra serve ./runtime --port 8787
  okra capability serve parser.mineru --port 8080
```

## `okra self-host validate --help`

```text
Usage: okra self-host validate [options] <bundleDir>

Validate a self-host runtime bundle without starting a server

Options:
  -h, --help  display help for command
```

## `okra self-host materialize --help`

```text
Usage: okra self-host materialize [options] <bundleDir>

Write deterministic Railway/Docker publish artifacts into the bundle

Options:
  -h, --help  display help for command
```

## `okra self-host proof --help`

```text
Usage: okra self-host proof [options] <bundleDir>

Run no-server draft proof checks against the self-host runtime bundle

Options:
  --evidence-out <path>       Write proof JSON to a file
  --generated-at <value>      Override generated_at for deterministic proof
                              artifacts
  --document-id <documentId>  Document id to use for proof workflow runs
                              (default: "doc-draft-proof")
  -h, --help                  display help for command
```

## `okra self-host plan --help`

```text
Usage: okra self-host plan [options] <bundleDir>

Render a self-host deploy preflight plan without deploying

Options:
  --target <target>  Deploy target to plan for (default: "railway")
  -h, --help         display help for command
```

## `okra self-host railway --help`

```text
Usage: okra self-host railway [options] <bundleDir>

Render Railway config-as-code for the public app service or a named service

Options:
  --service <serviceId>  Railway service id to render config for
  -h, --help             display help for command
```

## `okra self-host network-plan --help`

```text
Usage: okra self-host network-plan [options] <bundleDir>

Render Docker network handoff for separated services

Options:
  -h, --help  display help for command
```

## `okra self-host template --help`

```text
Usage: okra self-host template [options] <bundleDir>

Render Railway template composer handoff without publishing

Options:
  -h, --help  display help for command
```

## `okra self-host template-listing --help`

```text
Usage: okra self-host template-listing [options] <bundleDir>

Render Railway template listing metadata for publication

Options:
  -h, --help  display help for command
```

## `okra self-host template-evidence --help`

```text
Usage: okra self-host template-evidence [options] <bundleDir>

Render Railway template publication evidence scaffold

Options:
  -h, --help  display help for command
```

## `okra self-host implementations --help`

```text
Usage: okra self-host implementations [options] <bundleDir>

Render capability implementation handoff without publishing images

Options:
  -h, --help  display help for command
```

## `okra self-host capability-evidence --help`

```text
Usage: okra self-host capability-evidence [options] <bundleDir>

Render capability promotion evidence scaffold for production image handoff

Options:
  -h, --help  display help for command
```

## `okra self-host evidence-bundle --help`

```text
Usage: okra self-host evidence-bundle [options] <bundleDir>

Render Railway publish evidence bundle scaffold

Options:
  --template-evidence <path>    Path to Railway template publication evidence
  --capability-evidence <path>  Path to capability promotion evidence
  --smoke-evidence <path>       Path to live deploy smoke evidence
  --readiness <path>            Path to Railway publish readiness artifact
  --publish-pack <path>         Path to Railway publish pack artifact
  -h, --help                    display help for command
```

## `okra self-host publish-pack --help`

```text
Usage: okra self-host publish-pack [options] <bundleDir>

Render Railway template publication pack with Docker/network separation

Options:
  --template-url <url>             Published Railway template URL, when
                                   available
  --evidence-bundle <path>         JSON publish evidence bundle from `okra
                                   self-host evidence-bundle`
  --template-evidence <path>       JSON Railway template publication evidence
                                   from `okra self-host template-evidence`
  --base-url <url>                 Deployed self-host base URL, when available
  --model-backed <capabilityRefs>  Comma-separated model-backed capability refs
  --capability-evidence <path>     JSON capability promotion evidence from
                                   `okra self-host capability-evidence`
  --smoke-evidence <path>          JSON smoke evidence from `okra self-host
                                   smoke --evidence-out`
  --smoke-passed                   Mark live self-host smoke as passed for the
                                   supplied base URL
  -h, --help                       display help for command
```

## `okra self-host readiness --help`

```text
Usage: okra self-host readiness [options] <bundleDir>

Render Railway publish-readiness gates without publishing

Options:
  --template-url <url>             Published Railway template URL, when
                                   available
  --evidence-bundle <path>         JSON publish evidence bundle from `okra
                                   self-host evidence-bundle`
  --template-evidence <path>       JSON Railway template publication evidence
                                   from `okra self-host template-evidence`
  --base-url <url>                 Deployed self-host base URL, when available
  --model-backed <capabilityRefs>  Comma-separated model-backed capability refs
  --capability-evidence <path>     JSON capability promotion evidence from
                                   `okra self-host capability-evidence`
  --smoke-evidence <path>          JSON smoke evidence from `okra self-host
                                   smoke --evidence-out`
  --smoke-passed                   Mark live self-host smoke as passed for the
                                   supplied base URL
  -h, --help                       display help for command
```

## `okra self-host smoke --help`

```text
Usage: okra self-host smoke [options] [baseUrl]

Run upload, parse, review workflow smoke checks against a self-host base URL

Options:
  --api-key <apiKey>          API key for the target self-host instance
  --document-id <documentId>  Document id to use for the smoke upload
  --workflow <workflow>       Workflow branch to smoke: audit, redact, or both
                              (default: "audit")
  --timeout-ms <ms>           Upload wait timeout in milliseconds (default:
                              "5000")
  --evidence-out <path>       Write smoke evidence JSON for readiness gates
  -h, --help                  display help for command
```

## `okra self-host env --help`

```text
Usage: okra self-host env [options] <bundleDir>

Render a self-host .env template without deploying

Options:
  --target <target>  Environment target to render for (default: "railway")
  -h, --help         display help for command
```

## `okra self-host compose --help`

```text
Usage: okra self-host compose [options] <bundleDir>

Render Docker Compose artifacts without starting services

Options:
  --mode <mode>  Compose artifact mode: networks, stack, capabilities, or
                 integrations (default: "networks")
  -h, --help     display help for command
```

## `okra self-host serve --help`

```text
Usage: okra self-host serve [options] [bundleDir]

Serve a lightweight self-host runtime shell and API

Options:
  --host <host>       Host interface to bind (default: "0.0.0.0")
  --port <port>       Port to bind (default: "8787")
  --public-dir <dir>  Override static asset directory
  -h, --help          display help for command
```
