# Contributing

Thanks for your interest in contributing to `@yault/elizaos-plugin-aesp`.

## Ground Rules

- Be respectful and collaborative in issues and pull requests.
- Keep changes focused and minimal.
- Include tests for behavior changes and bug fixes.
- Do not include secrets, private keys, or sensitive data in commits.

## Development Setup

1. Fork and clone this repository.
2. Install dependencies:

```bash
npm install
```

3. Build and test:

```bash
npm run build
npm test
```

## Branches and Commits

- Create a feature branch from `main`.
- Use clear, descriptive commit messages.
- Keep each commit logically coherent.

## Pull Requests

Please include:

- A short summary of what changed and why.
- Linked issue(s), if applicable.
- Test evidence (`npm test`, and any additional validation).
- Notes on breaking changes or migrations.

Before opening a PR, verify:

- `npm run build` succeeds.
- `npm test` succeeds.
- Documentation is updated when behavior or public APIs change.

## Reporting Bugs

Use GitHub Issues for normal bugs and feature requests.

For security vulnerabilities, do not open a public issue. See [SECURITY.md](./SECURITY.md).
