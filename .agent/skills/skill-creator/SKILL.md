---
name: skill-creator
description: Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends capabilities with specialized knowledge, workflows, or tool integrations.
---

# Skill Creator

This skill provides guidance for creating effective skills.

## About Skills

Skills are modular, self-contained packages that provide specialized knowledge, workflows, and tools. They transform a general-purpose agent into a specialized one equipped with procedural knowledge.

### What Skills Provide

1. **Specialized workflows** - Multi-step procedures for specific domains
2. **Tool integrations** - Instructions for working with specific file formats or APIs
3. **Domain expertise** - Company-specific knowledge, schemas, business logic
4. **Bundled resources** - Scripts, references, and assets for complex tasks

## Core Principles

### Concise is Key
Only add context that isn't already available. Challenge each piece of information: "Does the agent really need this?" Prefer concise examples over verbose explanations.

### Anatomy of a Skill
Every skill consists of a required `SKILL.md` file and optional bundled resources:

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter metadata (name, description)
│   └── Markdown instructions
└── resources/ (optional)
    ├── scripts/    - Executable code
    ├── references/ - Documentation to be loaded as needed
    └── assets/     - Templates, icons, fonts, etc.
```

## Skill Creation Process

### Step 1: Planning
Analyze the task to identify what scripts, references, and assets would be helpful.

### Step 2: Initialization
Create the skill directory and the core `SKILL.md` file manually using shell commands.

```bash
mkdir -p .agent/my-skill/resources/{scripts,references,assets}
touch .agent/my-skill/SKILL.md
```

### Step 3: Implementation
Write the `SKILL.md` file. Always include the required YAML frontmatter:

```markdown
---
name: my-skill
description: Comprehensive description of what the skill does and when to use it.
---

# My Skill Name

## Overview
Briefly explain what this skill enables.

## Guidelines
...
```

## Progressive Disclosure
Keep `SKILL.md` lean (under 500 lines). Move detailed reference material, schemas, and examples to the `resources/references/` folder and link to them from `SKILL.md`.