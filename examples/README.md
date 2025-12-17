# Example Token Files

This directory contains example Style Dictionary token files that you can use to test the Figma Token Sync plugin.

## Files

- **colors.json** - Color palette with base colors and semantic tokens
- **spacing.json** - Spacing scale and component spacing/sizing
- **typography.json** - Font families, sizes, weights, and line heights

## Using These Examples

### Option 1: Fork this repository

1. Fork this repository to your GitHub account
2. In the Figma plugin, configure:
   - **Owner**: Your GitHub username
   - **Repository**: figma-token-sync
   - **Branch**: main
   - **Token File Paths**: `examples/tokens/*.json`

### Option 2: Copy to your own repository

1. Create a `tokens/` directory in your repository
2. Copy the JSON files from `examples/tokens/` to your `tokens/` directory
3. In the Figma plugin, configure:
   - **Owner**: Your GitHub username
   - **Repository**: Your repository name
   - **Branch**: Your branch name
   - **Token File Paths**: `tokens/*.json`

## What Gets Created in Figma

When you pull these tokens into Figma, the plugin will create:

### Color Collection
Variables created from `color` tokens:
- `base/white`, `base/black`
- `base/gray/100` through `base/gray/900`
- `base/blue/100`, `base/blue/500`, `base/blue/900`
- `base/red/100`, `base/red/500`, `base/red/900`
- `base/green/100`, `base/green/500`, `base/green/900`
- `semantic/primary`, `semantic/success`, `semantic/error`
- `semantic/background/default`, `semantic/background/subtle`
- `semantic/text/default`, `semantic/text/secondary`, `semantic/text/disabled`

### Spacing Collection
Variables created from `spacing` tokens:
- `scale/0` through `scale/16` (spacing scale)
- `component/padding/xs` through `component/padding/xl`
- `component/gap/xs` through `component/gap/lg`

### Size Collection
Variables created from `size` tokens:
- `icon/sm`, `icon/md`, `icon/lg`
- `button/height/sm`, `button/height/md`, `button/height/lg`

### Typography Collection
Variables created from `typography` tokens:
- `fontFamily/base`, `fontFamily/mono`
- `fontSize/xs` through `fontSize/4xl`
- `fontWeight/light` through `fontWeight/bold`
- `lineHeight/tight`, `lineHeight/normal`, `lineHeight/relaxed`

## Token References

Note that some tokens reference other tokens using the `{token.path}` syntax:

```json
{
  "semantic": {
    "primary": {
      "value": "{color.base.blue.500}",
      "type": "color"
    }
  }
}
```

These references are preserved when syncing between Figma and GitHub.

## Modifying Tokens

Feel free to:
- Add new tokens
- Modify existing values
- Add comments for documentation
- Organize tokens in different ways

Just make sure to follow the [Style Dictionary format](../docs/token-format.md).

## Testing the Plugin

1. Configure the plugin with your GitHub settings
2. Click "Test Connection" to verify everything is set up correctly
3. Click "Pull from GitHub → Figma"
4. Check your Figma file for the new variable collections and variables

## Next Steps

Once you're comfortable with the basic sync:
- Try modifying token values in GitHub and pulling again
- Explore organizing tokens in different ways
- Set up your own token structure for your design system
