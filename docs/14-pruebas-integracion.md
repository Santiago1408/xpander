# Pruebas de integración

Las pruebas de `api/cmd/server/integration_test.go` recorren la API completa contra un PostgreSQL real y desechable. No usan la base de desarrollo: `compose.test.yaml` es un proyecto Compose aparte (`xpander_test`) con la base en memoria, que desaparece al terminar. Además, la prueba se niega a ejecutarse si el nombre de la base no termina en `_test`.

## Ejecutar

Desde la raíz del repositorio:

```sh
sudo docker compose -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from tests
sudo docker compose -f compose.test.yaml down
```

La salida termina con `PASS` y `ok xpander/api/cmd/server` cuando todo funciona. Si algo falla, el nombre del subtest y el mensaje indican qué flujo se rompió.

## Qué comprueban

Cada ejecución crea el esquema desde cero con todas las migraciones (hasta la 026), un propietario, una sucursal e inicia sesión como lo hace el panel.

- **Pedido QR completo:** sin QR vigente el pedido se bloquea. Con QR: registrar, subir comprobante, verificar y confirmar. El stock solo baja al confirmar y una segunda confirmación no lo descuenta otra vez.
- **Sin stock:** no se puede pedir una talla sin unidades, en una sucursal sin stock ni más unidades de las disponibles.
- **Cancelaciones:** un pedido sin pago se cancela. Uno con pago verificado solo se cancela si ya no hay stock y con la devolución confirmada; confirmar sin stock falla sin tocar el inventario.
- **Venta en tienda:** descuenta stock, un reintento con la misma clave no la duplica, guarda canal, forma de pago y descuento, y se rechaza sin stock o con cantidades inválidas.
- **Logos:** sin logo elegido `/api/brand/…` redirige al original; con uno subido entrega el PNG, rechaza usar un QR como logo y no deja enviar a la papelera un logo en uso.
- **Landing:** guarda secciones (portada, beneficios, contacto y una oculta), publica en el orden del borrador, reordena y edita conservando los identificadores, omite las ocultas, devuelve el contenido de una versión anterior y rechaza publicar sin cambios.
- **Buzón de sugerencias:** guarda el celular sin el +591, rechaza un número inválido, ignora los envíos que llenan el campo trampa y permite marcar como atendida y eliminar.
- **Variantes de portada:** guarda y publica la configuración de «Fondo completo», rechaza un opacamiento mayor a 85 % y un diseño de portada en otra sección.
- **Límite de almacenamiento (`TestMediaQuota`):** con un límite de 2 KB, una foto se rechaza con 507 después de procesarla y no queda registrada.
- **Videos (`TestVideoUploads`):** con ffmpeg (incluido en la imagen de pruebas), un video de 2 s se convierte a MP4 con su portada WebP y admite peticiones por rangos; uno de 33 s y una imagen se rechazan; un video no entra en una sección de texto pero sí en la portada, y publicado es público; el sexto video se rechaza.

Las pruebas unitarias habituales siguen ejecutándose sin base de datos con `go test ./...`; las de integración solo corren con la etiqueta `integration`.
