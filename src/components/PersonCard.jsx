/**
 * PersonCard — Panel lateral con los datos de la persona reconocida.
 */
export default function PersonCard({ persona }) {
  if (!persona) {
    return (
      <div className="person-card empty">
        <div className="card-icon">👤</div>
        <p className="card-hint">Apunta la cámara hacia una cara registrada</p>
      </div>
    )
  }

  const campos = [
    { label: 'Nombre',    value: persona.nombre },
    { label: 'Edad',      value: persona.edad ? `${persona.edad} años` : null },
    { label: 'Carrera',   value: persona.carrera },
    { label: 'ID / Cédula', value: persona.id_institucional },
    { label: 'Email',     value: persona.email },
    { label: 'Teléfono',  value: persona.telefono },
    { label: 'Notas',     value: persona.notas },
  ].filter(c => c.value)

  return (
    <div className="person-card found">
      <div className="card-avatar">
        {persona.nombre?.charAt(0).toUpperCase() ?? '?'}
      </div>
      <h2 className="card-name">{persona.nombre}</h2>
      <div className="card-fields">
        {campos.map(({ label, value }) => (
          <div key={label} className="card-field">
            <span className="field-label">{label}</span>
            <span className="field-value">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
