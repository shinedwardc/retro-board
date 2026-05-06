export const up = (pgm) => {
  pgm.dropColumns('notes', ['position'])
}

export const down = (pgm) => {
  pgm.addColumn('notes', {
    position: { type: 'integer', default: 0 }
  })
}