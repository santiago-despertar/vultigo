# Abandonment sequences: people who finished the onboarding questions but did not pay.
# One sequence per main goal. Variables: {nombre}, {objetivo}. Blocks shown only when they apply:
# [[sin_proc]] only natural changes, [[proc]] open to procedures, [[cirugia]] open to surgery,
# [[presupuesto_bajo]] budget under $2,000 MXN. {boton:Text} is the button to finish the analysis.
# Style: short lines, lots of air, close and direct (same feel as the Primordial Men sequences).
DIAS = [0, 1, 2, 4, 6, 9, 13]

SEC = {}

SEC["fotos"] = ("Salir mejor en fotos / verme mejor en general", [
("Te quedaste a un paso, {nombre}", """{nombre}, vi que contestaste todo.

Tu edad, tu tipo de piel, lo que te gustaría cambiar.

Pero no terminaste tu análisis.

Y entiendo. A veces da nervio ver tu propia cara medida.

Pero déjame decirte algo:

Si no sales bien en fotos, el problema casi nunca es tu cara.

Es que nadie te ha dicho qué le favorece a TU cara.

Qué ángulo. Qué luz. Qué corte. Qué lado.

Eso es exactamente lo que medimos.

Tus respuestas siguen guardadas. Te faltan solo las fotos.

{boton:Terminar mi análisis}"""),
("Por qué no te reconoces en las fotos", """{nombre}, ¿te ha pasado que te ves bien en el espejo…

…y luego alguien te toma una foto y no te reconoces?

No es tu imaginación.

El celular de cerca deforma la cara.
A 30 centímetros la nariz se ve más grande y la mandíbula más angosta.

Y el espejo te muestra al revés.
Tu cara no es igual de los dos lados. La de casi nadie lo es.

Por eso hay un lado que te gusta y otro que no soportas.

Ahora imagina saber, con medidas, cuál es tu lado bueno.
Y qué distancia, qué ángulo y qué luz te hacen ver como te ves en persona.

Eso viene en tu análisis.

{boton:Descubrir mi mejor ángulo}"""),
("Hay tres caminos", """{nombre}, cuando alguien quiere verse mejor, normalmente toma uno de estos tres caminos:

1. Probar y probar.
Cortes, filtros, productos, ángulos. A ver qué funciona. Meses así.

2. Ir directo a una consulta.
Y que alguien que acabas de conocer te diga qué "corregir". Muchas veces, lo que vende.

3. Medir primero.
Saber con números qué proporciones tienes, qué te favorece y qué conviene cambiar primero.

El tercero es el único donde decides tú, con información.

Es el que empezaste.

{boton:Terminar mi análisis}"""),
("Lo que vas a ver cuando termines", """{nombre}, esto es lo que hay del otro lado:

Medimos más de 110 rasgos con tus fotos de frente, sonriendo y de perfil.

Y te decimos:

Tu calificación por zona.
Tus puntos fuertes, los que hay que resaltar.
Lo que más te suma cambiar primero.
Lo que no vale la pena tocar.
Tu mejor ángulo para fotos.
Y un plan de 90 días, paso a paso.
[[presupuesto_bajo]]
Y algo importante: la mayoría de lo que vas a ver en tu plan es gratis o muy barato. Verte mejor no tiene que ser caro.
[[/presupuesto_bajo]]
No es una opinión.
Es medición.

{boton:Ver mi análisis}"""),
("Un ejemplo", """{nombre}, te pongo un ejemplo típico.

Alguien de 29 años. Odia sus fotos. Cree que es su nariz.

Mide su cara y resulta que su nariz está dentro de lo normal.

Lo que pasa es que su cara es un poco más larga de lo común, y su corte de pelo, con volumen arriba, la alarga todavía más.

Cambia el corte. Toma sus fotos un poco más lejos y a la altura de los ojos.

Y de pronto ya no odia sus fotos.

No tocó nada de su cara.

Solo supo qué le favorecía.

Eso es lo que te falta saber a ti.

{boton:Terminar mi análisis}"""),
("Lo que más nos preguntan", """{nombre}, antes de terminar, casi todos tienen las mismas dudas:

"¿Y si me sale una calificación baja?"
El número es lo de menos. Lo que importa es el plan: qué subir primero y hasta dónde puedes llegar.

"¿Necesito fotos profesionales?"
No. Con tu celular y buena luz. Te guiamos foto por foto.

"¿Quién ve mis fotos?"
Nadie más. Solo se usan para tu análisis y las borras cuando quieras desde tu cuenta.
[[sin_proc]]
"¿Me van a recomendar cirugías?"
No. Nos dijiste que prefieres cambios naturales. Tu plan se queda en eso: estilo, rutina y hábitos.
[[/sin_proc]]
[[cirugia]]
"¿Y si sí quiero saber de procedimientos?"
El plan Completo te explica cuáles se suelen considerar para una cara como la tuya, qué hace cada uno y qué preguntar antes.
[[/cirugia]]
{boton:Terminar mi análisis}"""),
("Último correo sobre esto", """{nombre}, este es el último correo que te mando sobre tu análisis.

Así que te lo digo directo:

Puedes seguir adivinando qué te favorece.
Probando cortes. Borrando fotos.

O puedes saberlo en los próximos 10 minutos.

Tus respuestas siguen guardadas.
Solo subes tus fotos y listo.

{boton:Terminar mi análisis}

Aquí estaremos cuando quieras.
Resalta"""),
])

SEC["joven"] = ("Verme más joven", [
("Te quedaste a un paso, {nombre}", """{nombre}, vi que contestaste todo pero no terminaste tu análisis.

Nos dijiste que quieres verte más joven.

Y quiero que sepas algo:

Casi nadie sabe qué edad aparenta de verdad.

Unos se ven mayores de lo que son y no saben por qué.
Otros se ven más jóvenes y no saben qué están haciendo bien.

Tu análisis te dice tu edad visual contra tu edad real.
Y qué rasgos te están sumando años.

Tus respuestas siguen guardadas. Te faltan solo las fotos.

{boton:Ver mi edad visual}"""),
("No son las arrugas", """{nombre}, esto sorprende a casi todos:

Lo que más años le suma a una cara no son las arrugas.

Es la pérdida de contraste.

Piel opaca.
Ojeras marcadas.
Cejas que bajan.
Labios que pierden definición.
Un contorno de mandíbula que se borra.

Y aquí viene la buena noticia:

Varias de esas cosas se mejoran sin tocar nada.
Con rutina, hábitos y saber dónde poner atención.

La pregunta es cuáles aplican a TU cara.

Eso es lo que medimos.

{boton:Terminar mi análisis}"""),
("Hay tres caminos", """{nombre}, cuando alguien quiere verse más joven, suele tomar uno de tres caminos:

1. Comprar cremas.
La que recomienda la influencer, la que está de oferta, la que promete todo. Sin saber qué necesita su piel.

2. Ir directo a un tratamiento.
Caro. Y muchas veces atacando lo que no era lo más importante.

3. Medir primero.
Saber qué zona de tu cara está envejeciendo antes y qué conviene atender en qué orden.

El tercero ahorra dinero, tiempo y errores.

Es el que empezaste.

{boton:Terminar mi análisis}"""),
("Lo que vas a ver cuando termines", """{nombre}, esto es lo que hay del otro lado:

Tu edad visual contra tu edad real.
La edad que podrías aparentar siguiendo tu plan.
Tu calificación por zona.
Qué rasgos te quitan años y cuáles te los suman.
Una rutina para tu tipo de piel.
Y un plan de 90 días, paso a paso.
[[presupuesto_bajo]]
Y casi todo lo que funciona es barato. No necesitas una rutina de miles de pesos.
[[/presupuesto_bajo]]
Todo con más de 110 rasgos medidos en tus fotos.

{boton:Ver mi análisis}"""),
("Un ejemplo", """{nombre}, te pongo un ejemplo típico.

Alguien de 41 años. Siempre le dicen que se ve con cara de cansancio, aunque haya dormido bien.

Cree que necesita algo para las arrugas.

Mide su cara y lo que más le suma años son las ojeras y unas cejas muy delgadas que dejaron de enmarcar su mirada.

Deja crecer las cejas. Ajusta su sueño y la sal en la noche. Protector solar diario.

Tres meses después, ya nadie le pregunta si durmió mal.

No se hizo nada.

Solo atendió lo que de verdad importaba en su cara.

{boton:Terminar mi análisis}"""),
("Lo que más nos preguntan", """{nombre}, las dudas que casi todos tienen:

"¿De verdad me van a decir qué edad aparento?"
Sí. Y por qué: qué rasgos la suben y cuáles la bajan.

"¿Sirve si ya tengo más de 40 o 50?"
Sí. De hecho es cuando más se nota un buen plan.

"¿Quién ve mis fotos?"
Nadie más. Las borras cuando quieras desde tu cuenta.
[[sin_proc]]
"¿Me van a mandar a hacerme algo?"
No. Nos dijiste que prefieres cambios naturales. Tu plan se queda en eso.
[[/sin_proc]]
[[proc]]
"¿Hablan de tratamientos?"
Sí, como información para que llegues con tu médico sabiendo qué preguntar. Nunca como receta.
[[/proc]]
{boton:Terminar mi análisis}"""),
("Último correo sobre esto", """{nombre}, este es el último correo que te mando sobre tu análisis.

Cada mes que pasa sin saber qué hacer es un mes que la cara sigue cambiando.

Puedes seguir probando productos al azar.

O puedes saber, hoy, qué te está sumando años y qué hacer al respecto.

Tus respuestas siguen guardadas.

{boton:Ver mi edad visual}

Aquí estaremos cuando quieras.
Resalta"""),
])

SEC["mandibula"] = ("Mandíbula y perfil", [
("Te quedaste a un paso, {nombre}", """{nombre}, vi que contestaste todo pero no terminaste tu análisis.

Nos dijiste que te importa tu mandíbula y tu perfil.

Es de lo que más se puede medir:
el ángulo de tu mandíbula, tu mentón, tu cuello y la línea completa de tu perfil.

Y casi siempre la respuesta sorprende.

Porque mucha gente cree que es un problema de hueso…

…y no lo es.

Tus respuestas siguen guardadas. Te faltan solo las fotos.

{boton:Medir mi perfil}"""),
("Casi nunca es el hueso", """{nombre}, en la mayoría de las caras lo que esconde la mandíbula no es la estructura.

Es esto:

Grasa en papada y cuello.
La cabeza adelantada por pasar horas en el celular.
Cómo descansas la lengua y la boca.

Por eso hay gente que cambia su perfil por completo sin tocar nada.

Y gente que se opera y no ve la diferencia que esperaba.

La clave es saber cuánto de tu perfil depende de tu estructura y cuánto de lo demás.

Eso es lo que medimos.

{boton:Terminar mi análisis}"""),
("Hay tres caminos", """{nombre}, cuando alguien quiere una mandíbula más marcada, suele tomar uno de tres caminos:

1. Videos de "mewing" y ejercicios de mandíbula.
Meses haciéndolo sin saber si es lo que necesita.

2. Ir directo a rellenos o cirugía.
Caro. Y a veces innecesario.

3. Medir primero.
Saber con números cómo está tu ángulo, tu mentón y tu perfil, y qué conviene hacer primero.

El tercero es el único donde decides con información.

Es el que empezaste.

{boton:Terminar mi análisis}"""),
("Lo que vas a ver cuando termines", """{nombre}, esto es lo que hay del otro lado:

El ángulo de tu mandíbula y tu mentón, comparados con rangos de referencia.
Tu perfil completo, de la frente a la barbilla.
Tu calificación por zona.
Qué parte de tu perfil depende de estructura y qué parte no.
Lo que más te suma cambiar primero.
Y un plan de 90 días, paso a paso.
[[presupuesto_bajo]]
Antes de gastar en cualquier tratamiento, conviene saber si de verdad lo necesitas. Muchas veces no.
[[/presupuesto_bajo]]
Todo con más de 110 rasgos medidos.

{boton:Ver mi análisis}"""),
("Un ejemplo", """{nombre}, te pongo un ejemplo típico.

Alguien de 27 años. Siente que no tiene mandíbula. Ya estaba viendo precios de rellenos.

Mide su perfil y su estructura está bien.

Lo que borra su mandíbula es la postura, con la cabeza adelantada, y algo de grasa en la papada.

Trabaja la postura. Baja grasa poco a poco. Aprende a pararse y a posar.

En unos meses su perfil se ve distinto.

Se ahorró un tratamiento que no necesitaba.

{boton:Terminar mi análisis}"""),
("Lo que más nos preguntan", """{nombre}, las dudas que casi todos tienen:

"¿Necesito foto de perfil?"
Sí, y te guiamos para tomarla bien con tu celular.

"¿Me van a decir si mi mandíbula es buena?"
Te damos la medida contra rangos de referencia, y qué tanto se puede mejorar.

"¿Quién ve mis fotos?"
Nadie más. Las borras cuando quieras.
[[sin_proc]]
"¿Me van a mandar a cirugía?"
No. Nos dijiste que prefieres cambios naturales. Tu plan se queda en eso.
[[/sin_proc]]
[[cirugia]]
"¿Y si sí quiero saber de procedimientos?"
El plan Completo te explica qué se suele considerar para mandíbula y mentón, qué hace cada uno y qué preguntar antes. Mejor saberlo antes de pagar una consulta.
[[/cirugia]]
{boton:Terminar mi análisis}"""),
("Último correo sobre esto", """{nombre}, este es el último correo que te mando sobre tu análisis.

Así que te lo digo directo:

Puedes seguir viendo videos de mandíbula.
O cotizando tratamientos sin saber si los necesitas.

O puedes saber, en 10 minutos, exactamente cómo está tu perfil y qué hacer.

Tus respuestas siguen guardadas.

{boton:Medir mi perfil}

Aquí estaremos cuando quieras.
Resalta"""),
])

SEC["piel"] = ("Piel", [
("Te quedaste a un paso, {nombre}", """{nombre}, vi que contestaste todo pero no terminaste tu análisis.

Nos dijiste que quieres mejorar tu piel.

Y te voy a decir algo que casi nadie dice:

La mayoría de la gente con problemas de piel no necesita más productos.

Necesita los correctos. En el orden correcto.

Tu análisis revisa textura, tono, manchas, poros y ojeras en tus fotos, y te arma la rutina para tu piel.

Tus respuestas siguen guardadas. Te faltan solo las fotos.

{boton:Terminar mi análisis}"""),
("Más productos no es mejor piel", """{nombre}, el error más común con la piel es este:

Usar demasiado.

Limpiadores fuertes.
Exfoliantes todos los días.
Cinco sérums a la vez.

Y la piel termina irritada, roja, con más granos o más grasa.

Casi siempre gana una rutina corta y constante:
Limpiar suave. Hidratar. Protector solar.

Y luego agregar solo lo que tu piel necesita.

La pregunta es qué necesita la tuya.

{boton:Ver mi rutina}"""),
("Hay tres caminos", """{nombre}, cuando alguien quiere mejorar su piel, suele tomar uno de tres caminos:

1. Comprar lo que recomienda alguien en redes.
Que tiene otra piel, otro clima y otro presupuesto.

2. Ir directo a tratamientos caros.
Sin haber resuelto lo básico primero.

3. Ver primero qué tiene tu piel.
Y armar una rutina para eso, no para la de otra persona.

El tercero ahorra dinero y frustración.

Es el que empezaste.

{boton:Terminar mi análisis}"""),
("Lo que vas a ver cuando termines", """{nombre}, esto es lo que hay del otro lado:

Cómo está tu piel: textura, tono, manchas, ojeras y brillo.
Tu calificación por zona.
Una rutina de mañana y noche para tu tipo de piel.
Los colores que más te iluminan la cara.
Y un plan de 90 días, paso a paso.
[[presupuesto_bajo]]
Y una buena rutina no tiene que ser cara. Te decimos qué buscar, no marcas de lujo.
[[/presupuesto_bajo]]
Todo con más de 110 rasgos medidos en tus fotos.

{boton:Ver mi análisis}"""),
("Un ejemplo", """{nombre}, te pongo un ejemplo típico.

Alguien de 24 años. Granos en la frente y la piel grasosa. Ya probó de todo.

Resulta que estaba usando un limpiador tan fuerte que su piel producía más grasa para defenderse.

Cambia a un limpiador suave. Agrega hidratante y protector solar. Deja de exfoliarse diario.

Seis semanas después, su piel está más tranquila que en años.

Gastó menos que antes.

Solo dejó de pelear contra su piel.

{boton:Terminar mi análisis}"""),
("Lo que más nos preguntan", """{nombre}, las dudas que casi todos tienen:

"¿Se alcanza a ver la piel en una foto de celular?"
Sí, con buena luz natural. Te guiamos para tomarla.

"¿Me van a diagnosticar algo?"
No. Es un análisis estético. Si vemos algo que conviene revisar con un dermatólogo, te lo decimos.

"¿Quién ve mis fotos?"
Nadie más. Las borras cuando quieras.
[[proc]]
"¿Hablan de tratamientos?"
Sí, como información para que llegues con tu dermatólogo sabiendo qué preguntar. Nunca como receta.
[[/proc]]
{boton:Terminar mi análisis}"""),
("Último correo sobre esto", """{nombre}, este es el último correo que te mando sobre tu análisis.

Puedes seguir comprando productos a ver cuál sí funciona.

O puedes saber, hoy, qué necesita tu piel y qué le sobra.

Tus respuestas siguen guardadas.

{boton:Ver mi rutina}

Aquí estaremos cuando quieras.
Resalta"""),
])

SEC["rasgos"] = ("Cabello, cejas, vello facial y ojos", [
("Te quedaste a un paso, {nombre}", """{nombre}, vi que contestaste todo pero no terminaste tu análisis.

Nos dijiste que quieres mejorar {objetivo}.

Son de los cambios que más se notan.
Y de los más rápidos.

Pero solo si sabes qué forma le va a tu cara.

Porque el mismo corte que a alguien le queda increíble, a otra persona le alarga la cara o le ensancha la frente.

Tus respuestas siguen guardadas. Te faltan solo las fotos.

{boton:Terminar mi análisis}"""),
("El marco de tu cara", """{nombre}, el cabello, las cejas y la barba son el marco de tu cara.

Y un marco equivocado arruina hasta la mejor foto.

Un corte que no va con tus proporciones puede esconder tu mejor rasgo.
Unas cejas mal formadas cambian la mirada completa.
Una barba en el lugar equivocado puede ensanchar o alargar la cara.

Por eso no existe "el corte que le queda a todos".

Depende de la forma de tu cara y de tus medidas.

Eso es lo que medimos.

{boton:Ver qué me favorece}"""),
("Hay tres caminos", """{nombre}, cuando alguien quiere cambiar su corte o su estilo, suele tomar uno de tres caminos:

1. Enseñarle al barbero o estilista la foto de alguien más.
Que tiene otra cara.

2. Dejarse llevar por lo que está de moda.
Aunque no le favorezca.

3. Saber primero qué forma tiene su cara.
Y qué estilos le van a sus proporciones.

El tercero es el único que funciona a la primera.

Es el que empezaste.

{boton:Terminar mi análisis}"""),
("Lo que vas a ver cuando termines", """{nombre}, esto es lo que hay del otro lado:

Tu tipo de cara, medido.
Los cortes y estilos que te favorecen, para enseñárselos a tu barbero o estilista.
La forma de ceja que mejor va con tus ojos.
Qué hacer con la barba o el vello facial.
Tu calificación por zona.
Y un plan de 90 días, paso a paso.

Todo con más de 110 rasgos medidos en tus fotos.

{boton:Ver mi análisis}"""),
("Un ejemplo", """{nombre}, te pongo un ejemplo típico.

Alguien de 33 años. Siempre se corta igual. Siente que se ve "normal", nada más.

Mide su cara: es más ancha que larga, y su corte, rapado a los lados y plano arriba, la ensancha todavía más.

Cambia a un corte con más altura arriba. Se arregla las cejas sin adelgazarlas.

Mismo pelo. Misma cara.

Pero ahora la gente le pregunta qué se hizo.

{boton:Terminar mi análisis}"""),
("Lo que más nos preguntan", """{nombre}, las dudas que casi todos tienen:

"¿Me dicen exactamente qué corte pedir?"
Sí. Los estilos que van con tu tipo de cara, para que se los enseñes a quien te corta el pelo.

"¿Y si no tengo barba o no me la quiero dejar?"
Te decimos si te conviene y, si no, qué hacer en su lugar.

"¿Quién ve mis fotos?"
Nadie más. Las borras cuando quieras.
[[cirugia]]
"¿Y si quiero saber de procedimientos?"
El plan Completo explica los que se suelen considerar para cejas, ojos o cabello, y qué preguntar antes.
[[/cirugia]]
{boton:Terminar mi análisis}"""),
("Último correo sobre esto", """{nombre}, este es el último correo que te mando sobre tu análisis.

Puedes seguir yendo al barbero a ver qué sale.

O puedes llegar sabiendo exactamente qué pedir.

Tus respuestas siguen guardadas.

{boton:Ver qué me favorece}

Aquí estaremos cuando quieras.
Resalta"""),
])

if __name__ == "__main__":
    n = 0
    for k, (t, xs) in SEC.items():
        assert len(xs) == 7, k
        for a, c in xs:
            assert "—" not in a + c, (k, a)
            assert c.count("[[") % 2 == 0, (k, a)
            n += 1
    print(n, "correos OK")
