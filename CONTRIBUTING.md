# Contributing to FlowEngine

Thank you for your interest in contributing to FlowEngine! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## How to Contribute

### Reporting Bugs

Before submitting a bug report:
1. Check the [existing issues](https://github.com/Gkusekwa/FlowEngine/issues) to avoid duplicates
2. Use the latest version of FlowEngine
3. Collect relevant information (logs, screenshots, environment details)

When submitting a bug report, include:
- A clear, descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- Environment details (OS, Node.js version, browser)
- Relevant logs or error messages

### Suggesting Features

Feature requests are welcome! Please:
1. Check existing issues and discussions first
2. Clearly describe the use case and benefits
3. Provide examples of how the feature would work

### Pull Requests

#### Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/FlowEngine.git
   cd FlowEngine
   ```
3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/Gkusekwa/FlowEngine.git
   ```
4. Install dependencies:
   ```bash
   pnpm install
   ```

#### Development Workflow

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following our coding standards

3. Write or update tests as needed

4. Run the test suite:
   ```bash
   pnpm test
   ```

5. Run linting:
   ```bash
   pnpm lint
   ```

6. Commit your changes using conventional commits:
   ```bash
   git commit -m "feat: add new workflow validation"
   ```

#### Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Code style changes (formatting, semicolons) |
| `refactor` | Code refactoring |
| `perf` | Performance improvements |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks |

Examples:
```
feat(workflow): add parallel gateway support
fix(sla): correct business hours calculation
docs(api): update authentication examples
```

#### Submitting Your Pull Request

1. Push your branch:
   ```bash
   git push origin feature/your-feature-name
   ```

2. Open a Pull Request against the `main` branch

3. Fill out the PR template with:
   - Description of changes
   - Related issue number
   - Screenshots (if applicable)
   - Testing performed

4. Wait for review and address any feedback

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm 8+
- PostgreSQL 15+
- Redis 7+
- Docker (optional, for containerized development)

### Environment Setup

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. Configure your local database and Redis connections

3. Run database migrations:
   ```bash
   pnpm db:migrate
   ```

4. Start the development server:
   ```bash
   pnpm dev
   ```

### Project Structure

```
FlowEngine/
├── apps/
│   ├── api/          # NestJS backend
│   └── web/          # React frontend
├── packages/
│   └── shared/       # Shared types and utilities
├── docs/             # Documentation
└── docker-compose.yml
```

### Testing

- Unit tests: `pnpm test`
- Integration tests: `pnpm test:integration`
- E2E tests: `pnpm test:e2e`
- Coverage report: `pnpm test:coverage`

### Code Style

- We use ESLint and Prettier for code formatting
- Run `pnpm lint` to check for issues
- Run `pnpm format` to auto-fix formatting

## Documentation

- Update documentation for any user-facing changes
- Use clear, concise language
- Include code examples where helpful
- Keep the API reference up to date

## Review Process

1. All PRs require at least one approval
2. CI checks must pass (tests, linting, build)
3. Documentation must be updated if applicable
4. Breaking changes require discussion

## Getting Help

- Open a [Discussion](https://github.com/Gkusekwa/FlowEngine/discussions) for questions
- Join our community chat (coming soon)
- Review existing documentation in `/docs`

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to FlowEngine! 🚀
