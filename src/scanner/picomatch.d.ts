declare module 'picomatch' {
  interface PicomatchOptions {
    dot?: boolean;
  }

  type Picomatch = (pattern: string, options?: PicomatchOptions) => (test: string) => boolean;

  const picomatch: Picomatch;
  export default picomatch;
}
