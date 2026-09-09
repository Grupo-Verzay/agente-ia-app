export interface ViewerProps {
  url: string;
  mimeType: string;
  caption?: string;
  /**
   * El nombre real del archivo.
   *
   * Sin el, el visor se quedaba con `caption` -que un documento casi nunca
   * trae- y acababa rotulando "DOCUMENTO"; y al descargar, el navegador cogia
   * el nombre de la URL, que es nuestra clave de almacenamiento:
   * `false_219657780858905@lid_3EB06452FED6B95E74DCE5.pdf`. Ese nombre no le
   * dice nada a nadie y es el que se guarda en el disco de la persona.
   */
  fileName?: string;
}
