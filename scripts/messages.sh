find . \( \
    -type d -name "node_modules" -o \
    -type d -name "venv" -o \
    -type d -name "vector_stores" -o \
    -type d -name "__pycache__" -o \
    -type d -name "dist" -o \
    -type d -name "out" -o \
    -type d -name "logs" \
    \) -prune -o -type f \( -name "*.py" -o -name "*.ts" -o -name "*.tsx" \) \
    -exec grep -HnE "(socket|io|Socket|listener|monitor)\.(forward|emit|write|send|on)" {} \; \
    | sed 's/.*\///' \
    | sed 's/\(socket\|io\|Socket|listener\)\.\(on\|emit\|write\|send\)/        \2/g' \
    | sed 's/  */ /g' > messages.txt
