import { env, pipeline } from "@huggingface/transformers";

export const EMBEDDING_DIMENSIONS = 384;
export const EMBEDDING_MODEL = "onnx-community/all-MiniLM-L6-v2-ONNX";

export type Embedding = Float32Array;
export type Embed = (text: string) => Promise<Embedding>;
export type FeatureExtractor = (text: string) => Promise<Embedding>;

export function createEmbeddingService(load: () => Promise<FeatureExtractor>): Embed {
    let extractorPromise: Promise<FeatureExtractor> | undefined;

    return async (text) => {
        if (!text.trim()) {
            throw new Error("Text to embed must not be empty.");
        }
        extractorPromise ??= load().catch((error: unknown) => {
            extractorPromise = undefined;
            throw error;
        });
        const vector = await (await extractorPromise)(text);
        if (vector.length !== EMBEDDING_DIMENSIONS || [...vector].some((value) => !Number.isFinite(value))) {
            throw new Error(`Embedding model must return ${EMBEDDING_DIMENSIONS} finite values.`);
        }
        return vector;
    };
}

async function loadFeatureExtractor(): Promise<FeatureExtractor> {
    const extractor = await pipeline("feature-extraction", EMBEDDING_MODEL, {
        device: "cpu",
        dtype: "fp32",
    });
    return async (text) => {
        const output = await extractor(text, { pooling: "mean", normalize: true });
        if (output.dims.length !== 2 || output.dims[0] !== 1 || output.dims[1] !== EMBEDDING_DIMENSIONS) {
            throw new Error(`Embedding model returned unexpected dimensions: ${output.dims.join("x")}.`);
        }
        return Float32Array.from(output.data);
    };
}

export const embed: Embed = createEmbeddingService(async () => {
    env.allowRemoteModels = process.env.TRANSFORMERS_ALLOW_REMOTE_MODELS !== "false";
    if (process.env.TRANSFORMERS_CACHE_DIR) {
        env.cacheDir = process.env.TRANSFORMERS_CACHE_DIR;
    }
    return loadFeatureExtractor();
});
