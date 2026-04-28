import { processImage } from './processImage';
import { describe, expect, it } from 'vitest';

describe('processImage', () => {
    it('should resize image', async () => {
        const sharp = (await import('sharp')).default;
        const img = await sharp({
            create: {
                width: 240,
                height: 120,
                channels: 3,
                background: { r: 24, g: 119, b: 242 },
            },
        }).jpeg().toBuffer();

        const result = await processImage(img);

        expect(result.width).toBe(240);
        expect(result.height).toBe(120);
        expect(result.format).toBe('jpeg');
        expect(result.pixels.length).toBeGreaterThan(0);
        expect(result.thumbhash.length).toBeGreaterThan(0);
    });
});
