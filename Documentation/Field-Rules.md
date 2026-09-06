# Field and display registry v1

Baseline 2026-09-06. Sources: [app information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information), [version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information), [screenshots](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications).

| Field | Maximum | Unit |
| --- | --- | --- |
| name | 30 (minimum 2) | characters |
| subtitle | 30 | characters |
| description | 4000 | characters |
| promotionalText | 170 | characters |
| whatsNew | 4000 | characters |
| keywords | 100 | UTF-8 bytes |
| notes | 4000 | UTF-8 bytes |

Apple's character wording does not specify a universal grapheme/code-point algorithm. Report code points, UTF-16 units and graphemes separately; use conservative UTF-16 limits locally until live Unicode boundary evidence supports a less restrictive policy. Do not claim this is Apple's implementation. Byte fields use actual UTF-8 length. Normalize CRLF and remove one terminal newline, without other trimming. Keyword advice remains advisory beyond the byte budget.

Initial tested locale scope: en-US, de-DE, fr-FR, ja, pt-BR. Xcode mappings: de → de-DE, fr → fr-FR, ja → ja, pt-BR → pt-BR. Bare en/pt are ambiguous and need explicit region selection. Reject jp/us. New canonical ASC locales require a registry update; rejecting an unimplemented locale does not mean Apple lacks it.

Version platforms: IOS, MAC_OS, TV_OS, VISION_OS. Bundle registration platforms: IOS, MAC_OS, UNIVERSAL. Do not cast one enum to the other. Directory registry: macOS/MAC_OS, iOS/IOS, tvOS/TV_OS, visionOS/VISION_OS. Only macOS screenshot support is targeted initially.

APP_DESKTOP: PNG/JPEG, 16:10, 1280×800, 1440×900, 2560×1600, 2880×1800. Require genuine decoded bytes, RGB without alpha as a conservative local policy; no transforms. Limit each set to ten. Encoded size is bounded locally and must match reservation size. Other display families and any uncertain image restrictions remain conditional until independently verified.
