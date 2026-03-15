declare module "text-encoding" {
  export const TextEncoder: {
    new (): TextEncoder;
    prototype: TextEncoder;
  };

  export const TextDecoder: {
    new (label?: string, options?: TextDecoderOptions): TextDecoder;
    prototype: TextDecoder;
  };
}
