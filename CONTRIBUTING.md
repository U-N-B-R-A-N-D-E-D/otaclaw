# Contributing to OtaClaw for OpenClaw

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Contributing Guidelines](#contributing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Documentation](#documentation)
- [Community](#community)

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md):

- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback
- Respect different viewpoints and experiences

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally
3. **Create a branch** for your changes
4. **Make your changes** following our guidelines
5. **Submit a pull request**

## Development Setup

### Prerequisites

- Node.js 16+ (for development tools)
- A modern web browser
- Git

### Installation

```bash
# Clone your fork
git clone https://github.com/U-N-B-R-A-N-D-E-D/otaclaw.git
cd otaclaw

# Install development dependencies
npm install

# Copy configuration
cp config/config.example.js config/config.js

# Start development server
npm run dev
```

The development server will start at `http://localhost:8080`

### Project Structure

```
otaclaw/
├── src/               # Source code
│   ├── index.html     # Main UI
│   ├── css/           # Stylesheets
│   ├── js/            # JavaScript modules
│   └── assets/        # Static assets
├── config/            # Configuration files
├── deploy/            # Deployment scripts
└── docs/              # Documentation
```

## Contributing Guidelines

### What to Contribute

We welcome:

- 🐛 **Bug fixes**
- ✨ **New features** (discuss first in an issue)
- 📚 **Documentation improvements**
- 🎨 **UI/UX enhancements**
- 🌐 **Translations**
- 🖼️ **New sprite packs**

### Code Style

**JavaScript:**
- Use ES6+ features
- 2 spaces indentation
- Single quotes for strings
- Semicolons required
- Max line length: 100 characters

```javascript
// Good
function handleEvent(data) {
  const { type, payload } = data;
  
  if (type === 'message') {
    processMessage(payload);
  }
}

// Avoid
function handleEvent(data){
    var type = data.type
    if(type=='message'){processMessage(data.payload)}
}
```

**CSS:**
- Use CSS custom properties (variables)
- BEM naming convention for classes
- Alphabetical property order (within groups)

```css
/* Good */
.otaclaw-container {
  display: flex;
  align-items: center;
  background: var(--otaclaw-bg);
}

.otaclaw-container__sprite {
  width: 100%;
  height: 100%;
}

/* Avoid */
.container {
  background: #000;
  display:flex;
}
```

**HTML:**
- Semantic HTML5 elements
- Double quotes for attributes
- Lowercase tag names

### Commit Messages

Follow conventional commits:

```
type(scope): subject

body (optional)

footer (optional)
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style (formatting)
- `refactor`: Code refactoring
- `test`: Tests
- `chore`: Build process, dependencies

Examples:
```
feat(states): add celebration state with confetti

fix(websocket): handle reconnection after network loss

docs(readme): add troubleshooting section for touchscreens
```

### Documentation

- Update README.md if adding features
- Update docs/ for API changes
- Add JSDoc comments to functions
- Include examples for new features

## Pull Request Process

1. **Create an issue** first for significant changes
2. **Fork and branch**: `git checkout -b feature/my-feature`
3. **Make changes** with clear commit messages
4. **Test** your changes locally
5. **Update documentation** as needed
6. **Submit PR** with clear description

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation
- [ ] Breaking change

## Testing
How was this tested?

## Screenshots (if applicable)

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings
```

### Review Process

1. PR must pass automated checks (if implemented)
2. At least one maintainer review required
3. Address feedback promptly
4. Squash commits if requested

## Development Workflow

### Adding a New State

1. Add state to `config/config.example.js`:
   ```javascript
   states: ['idle', 'myState'],
   stateDurations: { myState: 3000 }
   ```

2. Create CSS in `src/css/animations.css`:
   ```css
   .state-myState .sprite {
     animation: myState-animation 1s infinite;
   }
   ```

3. Add to event mapping in config
4. Test manually
5. Update documentation

### Adding WebSocket Events

1. Handle event in `src/js/websocket-client.js`
2. Map to state or emit custom event
3. Document in `docs/API.md`

### Creating Sprites

1. Design in your preferred tool (Aseprite, Piskel, etc.)
2. Export PNG files
3. Place in `src/assets/sprites/{state}/`
4. Update `config.js` with frame count
5. Test animations

## Testing

Automated tests are maintained internally (outside this repo). For PRs, manual testing is required:

```bash
# Test different states
# 1. Open browser console
# 2. Run:
otaclaw.setState('thinking');
otaclaw.setState('success');

# Test WebSocket
# 1. Check connection status indicator
# 2. Verify auto-reconnect by restarting OpenClaw
```

### Test Checklist

Before submitting PR:

- [ ] All states render correctly
- [ ] WebSocket connects and reconnects
- [ ] Touch interactions work (if applicable)
- [ ] No console errors
- [ ] Responsive design works
- [ ] Kiosk mode works (if tested)

## Documentation

### Updating Docs

- Keep README.md concise
- Detailed info goes to docs/
- Update table of contents
- Check for broken links

### Writing Style

- Clear and concise
- Include code examples
- Use proper markdown formatting
- Add screenshots for UI changes

## Community

### Communication

- GitHub Issues: Bug reports, feature requests
- GitHub Discussions: General questions, ideas
- Pull Requests: Code contributions

### Getting Help

If stuck:

1. Check documentation
2. Search existing issues
3. Ask in discussions
4. Join community chat (if available)

### Recognition

No contributors are listed. The project is attributed solely to [ U N B R A N D E D ].

## Release Process

Maintainers will:

1. Update version in package.json
2. Update CHANGELOG.md
3. Create GitHub release
4. Tag version
5. Deploy to demo (if applicable)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to OtaClaw! 🎉
