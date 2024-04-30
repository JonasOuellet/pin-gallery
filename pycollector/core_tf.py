import tensorflow as tf
import numpy as np

from PIL import Image

from . import core


MODEL_B0 = tf.keras.applications.EfficientNetB0(include_top=False, pooling="avg", weights="imagenet")
# MODEL_B7 = tf.keras.applications.EfficientNetB7(include_top=False, pooling="avg", weights="imagenet")


def vectorize_with_text(
    filename: str,
    texts: list[str] | None = None
) -> np.ndarray:
    if texts is None:
        texts = core.detect_text(filename)

    if texts:
        encoded_text = core.encode_text(texts)
        if encoded_text is not None:
            return encoded_text

    return vectorize_file(filename)


def vectorize_file(filename: str) -> np.ndarray:
    img = Image.open(filename).convert("RGB")
    resized = np.array(img.resize([224, 224]))
    return MODEL_B0.predict(np.array([resized]))[0]
