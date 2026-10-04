cd ~/projects/open-sector
for s in paintDisk liftDisk levelDisk ripple repaintGround onMove onDown; do
  echo "== $s"
  timeout 90 node .gitnexus/run.cjs impact "$s" --direction upstream --repo . 2>&1 | grep -E -i '"risk"|impactedCount|"name"|filePath' | head -14
done
