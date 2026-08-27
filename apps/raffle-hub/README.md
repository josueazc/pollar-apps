# Raffle Hub

Rifas con tickets pagados y un sorteo que cualquiera puede volver a comprobar.

Una rifa de barrio funciona con papelitos y confianza: el que organiza saca el número
y todos tienen que creerle. Acá el ganador no lo decide nadie — sale del hash de un
ledger público de Stellar que nadie controla, ni el organizador. La página publica la
prueba y cualquier desconocido puede recalcular el resultado por su cuenta.

Cada ticket es un pago real en la testnet de Stellar vía el SDK de Pollar, directo a la
cuenta del organizador. **La app nunca toca la plata.**

---

## Correr desde cero

Requiere **Node 22.6+** (los scripts de spike usan el type stripping nativo) y `pnpm`.

```bash
git clone https://github.com/<tu-usuario>/pollar-apps
cd pollar-apps/apps/raffle-hub

cp .env.example .env
# pegá tu clave publishable de dashboard.pollar.xyz (Build → API Keys)

pnpm install
pnpm dev
```

Abrí http://localhost:3000. No hace falta nada más: la base de datos se crea sola en el
primer request.

> **Orígenes permitidos.** La clave publishable trae una lista de orígenes autorizados.
> Si el login falla con *"Could not load sign-in options"*, casi siempre es eso y no la
> conexión: agregá el origen exacto que estás usando (`http://localhost:3000`, tu IP de
> red local para probar desde el celular, y la URL de producción al desplegar) en el
> dashboard de Pollar.

### Variables de entorno

| Variable | Obligatoria | Para qué |
|---|---|---|
| `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY` | **sí** | Auth y pagos de Pollar. La red sale de la clave: `pub_testnet_…` → testnet. |
| `TURSO_DATABASE_URL` | no | Base remota para el deploy. Sin esto usa un archivo SQLite local. |
| `TURSO_AUTH_TOKEN` | no | Token de esa base remota. |

No hay ninguna otra. Es a propósito: una copia fresca del repo tiene que arrancar con
solo la clave de Pollar.

### Base de datos

[libSQL](https://github.com/tursodatabase/libsql). En local es un archivo SQLite
(`raffle-hub.db`, ignorado por git) que se crea solo — cero setup, cero migraciones que
correr a mano. El esquema vive en [`lib/db.ts`](lib/db.ts) y se aplica de forma
idempotente en el primer acceso.

En Vercel el filesystem es efímero, así que ahí hay que apuntar a una base libSQL/Turso
con las dos variables de arriba. No cambia ninguna otra línea de código.

Tres tablas: `raffles`, `tickets` y `draws`. Dos invariantes viven en el esquema y no en
el código de la app, que es donde tienen que estar:

- `UNIQUE (raffle_id, number)` — un número, un dueño. Dos celulares tocando el 7 al mismo
  tiempo compiten en el `INSERT`; uno gana y el otro recibe un error. No hay
  "consultar-y-después-escribir" que se pueda colar en el medio.
- `UNIQUE (tx_hash)` — un mismo pago no puede comprar dos tickets.

---

## El sorteo: cómo funciona y cómo comprobarlo

### El mecanismo

Se anuncia **antes** de vender un solo número, al crear la rifa:

1. La rifa fija su `drawTime` (UTC).
2. El **ledger decisivo** es el primer ledger de Stellar cuyo `closed_at` es igual o
   posterior al `drawTime`. Nadie elige cuál es, y no se puede saber de antemano.
3. `n` = el hash de ese ledger leído como entero de 256 bits.
4. Los tickets vendidos se ordenan de menor a mayor.
5. `índice = n mod cantidadVendidos` → el ganador es el ticket en esa posición.

Por qué esto no se puede acomodar:

- El hash del ledger lo publica la red, no la app. El organizador no puede influirlo.
- Antes del `drawTime` ese ledger **todavía no existe**, así que no se puede probar
  resultados hasta que salga el amigo. La ruta del sorteo se niega a correr antes de
  tiempo.
- El sorteo se escribe una sola vez. Un segundo intento devuelve el primer resultado en
  lugar de volver a tirar.
- Una vez publicada la prueba, la lista de vendidos queda fija: los pagos que llegan
  tarde se rechazan en vez de aceptarse en silencio, porque agregarlos dejaría la prueba
  contradiciendo a la página.

### Comprobarlo a mano

La página de la rifa muestra el ledger, su hash, la aritmética y el enlace al explorer.
Para verificarlo sin confiar en nada de acá:

```bash
pnpm verify:draw scripts/out/draw-proof.json
```

Ese script ([`scripts/verify-draw.mjs`](scripts/verify-draw.mjs)) **no importa nada de la
app**. Reimplementa el mecanismo desde cero, consulta Horizon público y solo acepta de la
prueba los *insumos declarados* (hora del sorteo y números vendidos, ambos publicados
antes de sortear). Todo lo demás lo vuelve a derivar.

Incluye el chequeo que atrapa un ledger elegido a dedo: que el ledger **anterior** haya
cerrado *antes* del `drawTime`. Sin eso, "el primero en o después" sería ambiguo.

Y si preferís hacerlo con las manos, sin scripts:

```bash
# 1. Traer el ledger que dice la prueba
curl -s https://horizon-testnet.stellar.org/ledgers/<secuencia> \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['hash'], d['closed_at'])"

# 2. Confirmar que el anterior cerró ANTES de la hora del sorteo
curl -s https://horizon-testnet.stellar.org/ledgers/<secuencia-1> \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['closed_at'])"

# 3. Recalcular el ganador
python3 -c "
hash_hex = '<hash>'
vendidos = [7, 12, 23, 41, 88]   # los de la página, ordenados
i = int(hash_hex, 16) % len(vendidos)
print('índice', i, '→ ganador #', vendidos[i])
"
```

Si eso no coincide con lo que muestra la página, la página miente y el explorer tiene
razón. Esa comprobación es exactamente el punto.

---

## Detección de pagos

Un ticket existe solo cuando está pagado. Hay dos caminos, y **ninguno de los dos confía
en el navegador del comprador**.

### Camino rápido: el comprador reporta el hash

Al pagar, el SDK de Pollar devuelve el hash de la transacción. El navegador lo manda a
`POST /api/tickets/:reference/confirm` y el ticket se asigna en un segundo, sin polling.

Pero un hash que manda un cliente es **una afirmación, no una prueba**. Antes de escribir
nada, el servidor vuelve a leer esa transacción de Horizon y comprueba, uno por uno: que
haya sido exitosa, que el memo sea exactamente la referencia de ese ticket, que el
destinatario sea el organizador, que el monto sea el precio, y que el asset sea el
correcto (el código solo no alcanza — cualquiera puede emitir un "USDC", así que se
verifica el emisor). Cualquier discrepancia devuelve 422 y la reserva simplemente vence.

### Camino de respaldo: leer los pagos del organizador

Algunos compradores cierran la pestaña, se quedan sin señal o sin batería entre confirmar
el pago y que la app se entere. La plata igual llegó, y el memo igual dice qué número era.

`POST /api/raffles/:id/reconcile` lee los pagos entrantes de la cuenta del organizador
directo de Horizon y asigna lo que pueda emparejar. La página de la rifa lo llama sola
cada 8 segundos mientras las ventas están abiertas.

> **Por qué Horizon y no el SDK.** El issue sugiere consultar el historial de
> transacciones del SDK. No sirve para esto: `fetchTxHistory` está limitado a la wallet
> del usuario **autenticado**, y acá hace falta ver los pagos que llegan a la cuenta del
> **organizador** mientras quien tiene el navegador abierto es un **comprador**. Ninguna
> sesión de comprador puede leer el historial del organizador. Horizon es público, no
> necesita auth, expone el memo, y es la misma fuente que auditaría un tercero — así que
> es a la vez la opción que funciona y la que se puede verificar.

### La referencia del ticket

Es lo único que ata un pago on-chain al número que compró, y viaja en el memo de texto de
Stellar, que tiene un límite duro de **28 bytes**:

```
RH-<idRifa>-<número>     p. ej.  RH-K7M2QX9B-0042     (16 bytes)
```

Por eso una rifa admite como máximo 9999 números: el número se rellena a 4 dígitos para
que la referencia entre en el memo.

### Límites, dichos de frente

- **La detección no es instantánea.** No hay webhooks del lado del cliente. El camino
  rápido tarda un segundo; el de respaldo, hasta 8 segundos de polling más lo que tarde
  Horizon en ingerir la transacción.
- **El respaldo mira una ventana finita** (los últimos 50 pagos). Un organizador con
  muchísimo movimiento podría empujar un pago viejo sin emparejar fuera de esa ventana.
- **Un pago sin memo, o con el memo equivocado, no se puede atribuir a ningún número.**
  Aparecen listados como `unmatched` en la respuesta de reconcile. La app no puede
  devolverlos porque nunca tuvo la plata: eso lo arregla el organizador por fuera.
- **Reportar un hash inventado mantiene la reserva viva** hasta que vence, porque una
  transacción que Horizon todavía no ingirió es indistinguible de una que no existe. El
  vencimiento de la reserva es lo que acota el daño.
- **Un pago que llega después del sorteo se rechaza.** La prueba publicada ya fijó los
  vendidos.

### Reservas

Elegir un número lo reserva **15 minutos** ([`lib/raffle.ts`](lib/raffle.ts)). Si el pago
no llega, la reserva se borra y el número vuelve a estar libre. Se borra en vez de
marcarse, porque es la restricción `UNIQUE` la que impide la doble venta: la fila tiene
que irse para que el número se pueda volver a elegir. No se pierde nada — una reserva que
nunca se pagó no tiene historia que valga la pena guardar.

La limpieza es perezosa: corre antes de cualquier lectura o escritura que dependa de qué
números están libres. Así el vencimiento es correcto sin necesitar un cron.

---

## Scripts

```bash
pnpm spike:draw      # sortea contra un ledger real y escribe la prueba
pnpm verify:draw     # la vuelve a verificar, sin importar nada de la app
pnpm spike:payment   # 8 casos de verificación de pagos contra una tx real de testnet
pnpm spike:cycle     # ciclo completo contra el server (necesita `pnpm dev` corriendo)
pnpm typecheck
pnpm lint
```

`spike:cycle` no falsifica pagos a propósito: convertir un ticket en venta exige un pago
real de Stellar con el memo correcto, y no hay forma de fabricar uno. Esa es justamente la
propiedad sobre la que se apoya todo el diseño. La mitad vendida del ciclo se ejercita
pagando de verdad desde la app.

---

## Cómo está armado

| Pieza | Dónde | Qué hace |
|---|---|---|
| Motor del sorteo | [`lib/draw.mjs`](lib/draw.mjs) | Sin dependencias, JS plano: un tercero tiene que poder leerlo y correrlo sin toolchain. |
| Verificador | [`scripts/verify-draw.mjs`](scripts/verify-draw.mjs) | Reimplementación independiente. No importa nada de la app. |
| Verificación de pagos | [`lib/horizon.ts`](lib/horizon.ts) | La frontera de confianza. Relee todo de Horizon. |
| Reglas de dominio | [`lib/raffle.ts`](lib/raffle.ts) | Referencias, ventana de reserva, validación. |
| Persistencia | [`lib/db.ts`](lib/db.ts), [`lib/store.ts`](lib/store.ts) | Esquema libSQL y repositorio. |
| Página pública | [`app/r/[id]/page.tsx`](app/r/%5Bid%5D/page.tsx) | Server Component: el tablero se ve sin login y sin JS. |

La capa de Pollar del template (auth, balance, pagos) no se reescribió. Los pagos pasan
por `runTx('payment', …)` con el memo, que es la vía que el `CLAUDE.md` del template
habilita para componentes propios.

### Detalles que cuestan una tarde si no se saben

- **Las fechas están fijadas a `America/La_Paz`.** `toLocaleString()` sin argumentos lee
  la zona del *host*, así que Node y el navegador no coinciden y React reporta un error de
  hidratación. Fijarla no es un parche: esta app es para público boliviano y una hora de
  sorteo es una promesa — todos tienen que leer el mismo instante, desde cualquier
  dispositivo y estén donde estén. Bolivia no usa horario de verano, así que La Paz es un
  UTC-4 estable.
- **El origin de los QR sale de los headers del request**, no de `window`. Derivarlo del
  navegador significaba que el servidor no renderizaba ningún QR y el cliente sí, otro
  error de hidratación.
- **`turbopack.root` está fijado** en [`next.config.ts`](next.config.ts). Si no, Turbopack
  sube buscando un lockfile y se puede ir hasta afuera del repo.

---

## Fuera de alcance

Mainnet o plata real. Custodia del premio, escrow o pago automático del premio: la app
registra y prueba, el organizador entrega. Devoluciones y cancelaciones. Varios premios
por rifa. Interoperabilidad con QR Simple ni ningún riel fiat — los QR de acá son propios
y se liquidan en la testnet de Stellar vía Pollar.
