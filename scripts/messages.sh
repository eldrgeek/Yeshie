find . \( -type d -name "node_modules" -o -name "venv" \) -prune -o -type f \( -name "*.py" -o -name "*.ts" -o -name "*.tsx" \) \
    -exec grep -HnE "(socket|io|Socket|listener|monitor)\.(forward|emit|write|send|on)" {} \; \
    | sed 's/.*\///' \
    | sed 's/\(socket\|io\|Socket|listener\)\.\(on\|emit\|write\|send\)/        \2/g' \
    | sed 's/  */ /g' > messages.txt
