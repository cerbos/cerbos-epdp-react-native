import JSBI from "jsbi";

export interface Allocator {
  memory: ArrayBuffer;
  allocate: (length: number) => bigint;
  deallocate: (offset: number, length: number) => void;
}

export const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
export const utf8Encoder = new TextEncoder();

export class Slice {
  public static from(allocator: Allocator, offsetAndLength: bigint): Slice {
    const num = JSBI.BigInt(offsetAndLength.toString());
    const responseOffset = JSBI.signedRightShift(num, JSBI.BigInt(32));
    const lengthMask = JSBI.BigInt("0xffffffff");
    const responseByteLength = JSBI.bitwiseAnd(num, lengthMask);

    return new Slice(
      allocator,
      JSBI.toNumber(responseOffset),
      JSBI.toNumber(responseByteLength)
    );
  }

  public static ofJSON(allocator: Allocator, data: unknown): Slice {
    return Slice.ofString(allocator, JSON.stringify(data));
  }

  public static ofString(allocator: Allocator, data: string): Slice {
    const bytes = utf8Encoder.encode(data);

    const offset = Number(allocator.allocate(bytes.length));

    const slice = new Slice(allocator, offset, bytes.length);

    try {
      slice.copy(bytes);
      return slice;
    } catch (error) {
      slice.deallocate();
      throw error;
    }
  }

  public readonly deallocate: () => void;
  private readonly bytes: Uint8Array;

  private constructor(
    { memory, deallocate }: Allocator,
    public readonly offset: number,
    public readonly length: number
  ) {
    this.deallocate = (): void => {
      deallocate(offset, length);
    };

    this.bytes = new Uint8Array(memory, offset, length);
  }

  public text(): string {
    return utf8Decoder.decode(this.bytes);
  }

  private copy(bytes: Uint8Array): void {
    this.bytes.set(bytes);
  }
}
