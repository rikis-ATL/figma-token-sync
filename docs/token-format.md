# Token File Format

This plugin uses the [Style Dictionary](https://styledictionary.com/) format for design tokens.

## Basic Structure

Tokens are organized in a nested JSON structure where each token has a `value` and optional `type`.

```json
{
  "color": {
    "primary": {
      "500": {
        "value": "#ff5433",
        "type": "color"
      }
    }
  }
}
```

## Supported Token Types

### Colors

```json
{
  "color": {
    "brand": {
      "primary": {
        "value": "#ff5433",
        "type": "color",
        "comment": "Primary brand color"
      },
      "secondary": {
        "value": "rgb(0, 122, 255)",
        "type": "color"
      }
    },
    "background": {
      "default": {
        "value": "#ffffff",
        "type": "color"
      }
    }
  }
}
```

**Supported formats:**
- Hex: `#ff5433`, `#f54`
- RGB: `rgb(255, 84, 51)`
- RGBA: `rgba(255, 84, 51, 0.8)`

**Figma mapping:**
- Maps to Figma `COLOR` variable type
- Converts to RGBA (0-1) internally

### Spacing & Sizing

```json
{
  "spacing": {
    "xs": {
      "value": "4px",
      "type": "dimension"
    },
    "sm": {
      "value": "8px",
      "type": "dimension"
    },
    "md": {
      "value": "16px",
      "type": "dimension"
    }
  },
  "size": {
    "icon": {
      "sm": {
        "value": "16px",
        "type": "dimension"
      },
      "md": {
        "value": "24px",
        "type": "dimension"
      }
    }
  }
}
```

**Supported units:**
- `px`, `rem`, `em`, `pt`
- Unitless numbers

**Figma mapping:**
- Maps to Figma `FLOAT` variable type
- Units are stripped (only numeric value stored)

### Typography

```json
{
  "font": {
    "family": {
      "base": {
        "value": "Inter, sans-serif",
        "type": "fontFamily"
      }
    },
    "size": {
      "body": {
        "value": "16px",
        "type": "fontSize"
      },
      "heading": {
        "value": "24px",
        "type": "fontSize"
      }
    },
    "weight": {
      "regular": {
        "value": "400",
        "type": "fontWeight"
      },
      "bold": {
        "value": "700",
        "type": "fontWeight"
      }
    }
  }
}
```

**Figma mapping:**
- Font family: `STRING` variable
- Font size: `FLOAT` variable (px stripped)
- Font weight: `FLOAT` variable

### Other Types

```json
{
  "opacity": {
    "subtle": {
      "value": "0.6",
      "type": "opacity"
    }
  },
  "duration": {
    "fast": {
      "value": "150ms",
      "type": "duration"
    }
  },
  "boolean": {
    "enabled": {
      "value": true,
      "type": "boolean"
    }
  }
}
```

## Token References (Aliases)

Tokens can reference other tokens using curly brace syntax:

```json
{
  "color": {
    "base": {
      "red": {
        "value": "#ff0000",
        "type": "color"
      }
    },
    "semantic": {
      "error": {
        "value": "{color.base.red}",
        "type": "color",
        "comment": "References base.red"
      }
    }
  }
}
```

**Note:** Token references are preserved when syncing between Figma and GitHub.

## File Organization

You can organize tokens into multiple files:

```
tokens/
├── colors.json          # All color tokens
├── spacing.json         # Spacing and sizing
├── typography.json      # Font-related tokens
└── semantic.json        # Semantic tokens (may reference others)
```

**Plugin Configuration:**
```
Token File Paths: tokens/*.json
```

Or specify individual files:
```
Token File Paths: tokens/colors.json, tokens/spacing.json
```

## Complete Example

```json
{
  "color": {
    "base": {
      "blue": {
        "100": { "value": "#e6f2ff", "type": "color" },
        "500": { "value": "#007aff", "type": "color" },
        "900": { "value": "#003d80", "type": "color" }
      }
    },
    "semantic": {
      "primary": {
        "value": "{color.base.blue.500}",
        "type": "color"
      }
    }
  },
  "spacing": {
    "scale": {
      "1": { "value": "4px", "type": "dimension" },
      "2": { "value": "8px", "type": "dimension" },
      "3": { "value": "12px", "type": "dimension" },
      "4": { "value": "16px", "type": "dimension" }
    }
  },
  "typography": {
    "fontSize": {
      "sm": { "value": "12px", "type": "fontSize" },
      "base": { "value": "16px", "type": "fontSize" },
      "lg": { "value": "20px", "type": "fontSize" }
    },
    "fontWeight": {
      "regular": { "value": "400", "type": "fontWeight" },
      "medium": { "value": "500", "type": "fontWeight" },
      "bold": { "value": "700", "type": "fontWeight" }
    }
  }
}
```

## Figma Variable Collections

Tokens are organized into Figma Variable Collections based on their top-level key:

- `color` → "Colors" collection
- `spacing` → "Spacing" collection
- `typography` → "Typography" collection

Variables are created with paths like:
- `color.base.blue.500` → Variable named "base/blue/500"
- `spacing.scale.1` → Variable named "scale/1"

## Resources

- [Style Dictionary Documentation](https://styledictionary.com/)
- [Design Tokens W3C Community Group](https://design-tokens.github.io/community-group/)
- [Figma Variables Documentation](https://help.figma.com/hc/en-us/articles/15339657135383-Guide-to-variables-in-Figma)
