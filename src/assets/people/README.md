# Local profile portraits

Sarah Miller and Patrick Sena retain the supplied original photos, optimized as the existing 192×192 JPEGs. Do not replace those files with generated portraits.

The other 47 directory people have unique locally bundled fictional portraits generated for this application. Seven additional fictional portraits cover stakeholder and agent-owner names used elsewhere in the workspace. These are generated characters, not photographs of real employees. They use consistent neutral backgrounds and centered head-and-shoulders crops.

The generated portraits were prepared from small contact sheets, cropped to individual square images, resized to 192×192 and saved as optimized JPEGs. The 47 directory assets total 265,260 bytes; each is at most 7,490 bytes. Full contact sheets are not shipped.

`src/data/assets.js` imports and maps names to files. All avatar views use that map, render circularly with centered `object-fit: cover`, and the standalone build embeds the images as data URIs. No image URL is loaded from an external origin.
