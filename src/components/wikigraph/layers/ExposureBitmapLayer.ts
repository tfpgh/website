import { BitmapLayer } from "@deck.gl/layers";

export default class ExposureBitmapLayer extends BitmapLayer {
  static layerName = "ExposureBitmapLayer";

  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      inject: {
        ...shaders.inject,
        "fs:DECKGL_FILTER_COLOR": `
          color.a = asinh(color.a / 0.2) / asinh(1.0 / 0.2);
        `,
      },
    };
  }
}
